import os
import json
import traceback
import itertools
import math
import time
from queue import Empty
from core.core import Core
from core.database import DatabaseContext

class RankingService(Core):
    SCHEMATICS_DIR = "./assets/schematics"

    def __init__(self, input_queue, log_queue, discord_queue, cache):
        super().__init__(log_queue)
        self.input_queue = input_queue
        self.discord_queue = discord_queue
        self.cache = cache
        self.running = True
        self.schematic_definitions = {} 
        self.ingredient_lookup = {} # Maps 'fruit' -> '1.2.276...'

    def run(self):
        DatabaseContext.initialize()
        self.info("Initializing Ranking Service...")
        
        # Build Lookup Maps based on Server 'cuemu' (Assuming single server structure for now, 
        # but in multi-server, we'd need per-server lookups)
        # For simplicity, we hydrate from the cache of the active server if available, 
        # or we just iterate known servers.
        self._hydrate_lookups()
        
        self._initialize_schematics()
        self.info("Ranking Service Ready.")

        while self.running:
            try:
                message = self.input_queue.get(timeout=1)
                if message is None: break
                self._process_message(message)
            except Empty:
                continue
            except KeyboardInterrupt:
                self.running = False
            except Exception as e:
                self.error(f"Ranking Loop Crash: {e}\n{traceback.format_exc()}")

    def _hydrate_lookups(self):
        """
        Builds a reverse map of { 'fruit': '1.2.x', 'organic': '1.2' }
        using the taxonomy data in the cache.
        """
        # We iterate over all loaded servers in the cache
        if self.cache._shared_data is None: return

        for server_id, data in self.cache._shared_data.items():
            if server_id == 'schematics': continue # Skip the schematics key itself
            
            taxonomy = data.get('taxonomy', {})
            server_lookup = {}
            
            for class_tree, details in taxonomy.items():
                # Map Enum
                if details.get('enum'):
                    server_lookup[details['enum']] = class_tree
                
                # Map Label (Lowercased)
                if details.get('label'):
                    server_lookup[details['label'].lower()] = class_tree
                
                # Map ID to itself for safety
                server_lookup[class_tree] = class_tree

            if 'lookups' not in self.cache._shared_data:
                self.cache._shared_data['lookups'] = {}
            
            # Note: We can't write to nested dicts in Manager.dict directly easily
            # We have to re-assign the whole dict key usually
            # But for read-only local usage in RankingService, we store it locally
            if server_id not in self.ingredient_lookup:
                self.ingredient_lookup[server_id] = server_lookup

    def _initialize_schematics(self):
        if not os.path.exists(self.SCHEMATICS_DIR):
            self.warning(f"Schematics directory not found: {self.SCHEMATICS_DIR}")
            return

        # Structure: { "server_id": { "schem_id": { ... } } }
        schematics_by_server = {} 
        count = 0

        for root, dirs, files in os.walk(self.SCHEMATICS_DIR):
            for filename in files:
                if not filename.endswith(".json"): continue
                
                # infer server from path: assets/schematics/{server_id}/...
                # path parts: ['.', 'assets', 'schematics', 'cuemu', 'food']
                parts = os.path.normpath(root).split(os.sep)
                try:
                    # Find 'schematics' index
                    idx = parts.index('schematics')
                    if len(parts) > idx + 1:
                        server_id = parts[idx + 1]
                    else:
                        server_id = 'common'
                except ValueError:
                    server_id = 'common'

                try:
                    fp = os.path.join(root, filename)
                    with open(fp, 'r') as f:
                        data = json.load(f)
                    
                    schematic_id = os.path.splitext(filename)[0]
                    data['id'] = schematic_id
                    data['server_id'] = server_id
                    data['file_path'] = fp # Save path for write-back

                    # Store locally
                    if server_id not in self.schematic_definitions:
                        self.schematic_definitions[server_id] = {}
                    
                    self.schematic_definitions[server_id][schematic_id] = data
                    count += 1

                except Exception as e:
                    self.error(f"Failed to load schematic {filename}: {e}")

        # Update Shared Cache
        try:
            if self.cache._shared_data is not None:
                # We need to structure it as the CacheManager expects:
                # _shared_data[server_id]['schematic_map'] = { id: data }
                # Note: CacheManager initializes this structure. We should update it.
                
                for srv, schems in self.schematic_definitions.items():
                    # We need to fetch existing server data, update map, and write back
                    # This is tricky with multiprocessing Manager. simpler to write to specific keys if supported
                    # or assume CacheManager built the initial structure and we overwrite 'schematic_map'
                    
                    existing_data = self.cache.get_server_data(srv)
                    if existing_data:
                        # Update the map
                        existing_data['schematic_map'] = schems
                        # Re-assign to trigger sync
                        self.cache._shared_data[srv] = existing_data
                
                self.info(f"Loaded {count} schematics into shared cache.")
            else:
                self.error("Shared Cache is not initialized!")
        except Exception as e:
            self.error(f"Failed to update shared cache: {e}")

    def _generate_combinatorial_keys(self, exp_titles):
        """Generates list of combination keys."""
        if not exp_titles: return [("default", [])]

        cats = []
        for title in exp_titles:
            cat_id = f"exp_{title.lower().replace(' ', '_')}"
            cats.append({"id": cat_id, "title": title})

        combos = []
        # Add default/empty
        combos.append(("default", []))
        
        for r in range(1, len(cats) + 1):
            for subset in itertools.combinations(cats, r):
                # subset is list of dicts
                sorted_ids = sorted([c['id'] for c in subset])
                key = "|".join(sorted_ids)
                combos.append((key, subset))
        
        return combos

    def _process_message(self, packet):
        action = packet.get('action')
        if action == "rank_resource":
            self._handle_rank_resource(packet)

    def _handle_rank_resource(self, packet):
        resource = packet.get('resource')
        server_id = packet.get('server_id')
        
        if not resource or not server_id: return

        # 1. Identify Affected Schematics
        # We need the resource's class tree
        res_class = resource.get('class_tree')
        if not res_class: return

        lookup = self.ingredient_lookup.get(server_id, {})
        affected_schematics = [] # List of (schematic_id, slot_name, ingredient_tree_id)

        server_schematics = self.schematic_definitions.get(server_id, {})
        
        for sch_id, schem_data in server_schematics.items():
            slots = schem_data.get('slots', {})
            for slot_name, slot_def in slots.items():
                # Schematic only cares if slot type is 0 (resource) usually?
                # Or mixed? Assuming Type 0 for now based on previous context.
                if slot_def.get('slot_type') != 0: continue

                ingredient_str = slot_def.get('ingredient')
                # Resolve ingredient string to ID
                # Try direct, try lower, try as ID
                req_id = lookup.get(ingredient_str) or lookup.get(ingredient_str.lower())
                if not req_id and ingredient_str.replace('.', '').isdigit():
                    req_id = ingredient_str
                
                if req_id and res_class.startswith(req_id):
                    # Match found!
                    affected_schematics.append((sch_id, slot_name, ingredient_str, req_id))

        if not affected_schematics:
            self.info(f"Resource {resource.get('name')} ({res_class}) affects no schematics.")
            return

        self.info(f"Resource {resource.get('name')} triggers update for {len(affected_schematics)} schematics.")

        # 2. Re-Rank Affected Slots
        # To ensure accuracy (Top 10), we must fetch all candidates for the slot, 
        # score them, and rebuild the list.
        
        for sch_id, slot_name, ing_name, req_tree_id in affected_schematics:
            self._update_schematic_ranking(server_id, sch_id, ing_name, req_tree_id, resource)

    def _update_schematic_ranking(self, server_id, sch_id, ing_key, req_tree_id, new_resource):
        schematic = self.schematic_definitions[server_id][sch_id]
        
        # Get Weights
        experiment_weights = schematic.get('experiment_weights', {})
        exp_keys = list(experiment_weights.keys())
        combos = self._generate_combinatorial_keys(exp_keys)

        # Ensure rankings structure exists
        if 'rankings' not in schematic: schematic['rankings'] = {}
        if ing_key not in schematic['rankings']: schematic['rankings'][ing_key] = {}

        # Fetch Candidates from DB
        # This includes the new resource since it was inserted before this event fired
        sql = """
            SELECT id, class_tree, is_active,
                   res_quality, res_decay_resist, res_flavor, res_potential_energy,
                   res_malleability, res_toughness, res_shock_resistance,
                   res_cold_resist, res_heat_resist, res_conductivity, entangle_resistance
            FROM resource_log
            WHERE server_id = %s AND class_tree LIKE %s
        """
        # LIKE '1.2.3%' matches 1.2.3, 1.2.3.4
        like_param = f"{req_tree_id}%"
        
        with DatabaseContext.cursor() as cur:
            cur.execute(sql, (server_id, like_param))
            candidates = cur.fetchall()

        # Get Caps for the SLOT Requirement (not the specific resource class)
        # We need to look up stats for req_tree_id in the cache
        taxonomy = self.cache.get_server_data(server_id).get('taxonomy', {})
        slot_def = taxonomy.get(req_tree_id, {})
        slot_caps = {}
        available_stats = set()
        
        if slot_def and 'stats' in slot_def:
            for stat_k, stat_v in slot_def['stats'].items():
                # stat_k is 'res_quality', stat_v is {min, max}
                available_stats.add(stat_k)
                slot_caps[stat_k] = stat_v['max']
        else:
            # Fallback if cache missing? Use 1000
            slot_caps = {k: 1000 for k in ValidationService.STAT_COLS}
            available_stats = set(ValidationService.STAT_COLS)

        # Pre-Normalize Candidates
        pre_norm = []
        for cand in candidates:
            norm = {}
            for stat, cap in slot_caps.items():
                val = cand.get(stat)
                if val is None: val = 0
                score = float(val) / float(cap) if cap > 0 else 0
                norm[stat] = min(score, 1.0)
            pre_norm.append({'data': cand, 'norm': norm})

        # Calculate Rankings for each Combo
        for combo_key, subset_cats in combos:
            # Calculate Target Weight Vector
            target_weights = {}
            for cat_info in subset_cats:
                # Find weights in original schematic dict
                # cat_info['title'] is "Experimental Flavor"
                w = experiment_weights.get(cat_info['title'], {})
                for stat, weight in w.items():
                    target_weights[stat] = target_weights.get(stat, 0) + weight

            # Score candidates
            scored_list = []
            for item in pre_norm:
                score = self._calculate_score(item['norm'], target_weights, available_stats)
                
                # Round down to 3 decimals
                final_score = math.floor(score * 1000) / 1000.0
                
                if final_score > 0:
                    scored_list.append({
                        'id': item['data']['id'],
                        'rating': f"{final_score:.1%}",
                        'raw_score': final_score,
                        'stats': self._extract_stats_breakdown(item['norm'], target_weights, available_stats)
                    })

            # Sort
            scored_list.sort(key=lambda x: x['raw_score'], reverse=True)

            # Assign Ranks
            for i, entry in enumerate(scored_list):
                entry['rank'] = i + 1

            # Split Best / Current
            best_list = scored_list[:10]
            current_list = [
                x for x in scored_list 
                # Look up is_active from original data
                if next((c['data']['is_active'] for c in pre_norm if c['data']['id'] == x['id']), False)
            ][:10]

            # Discord Alert Check
            self._check_discord_alert(new_resource, best_list, current_list, schematic['custom_object_name'], combo_key)

            # Update Schematic Object
            schematic['rankings'][ing_key][combo_key] = {
                "best": best_list,
                "current": current_list
            }

        # Update Metadata
        schematic['last_updated'] = int(time.time())

        # Write to Disk
        try:
            with open(schematic['file_path'], 'w', encoding='utf-8') as f:
                # We need to remove 'file_path' and 'server_id' key before writing? 
                # Or just write the 'details' + rankings.
                # Actually, self.schematic_definitions contains the FULL json structure loaded.
                # But we added 'file_path' to it. We should strip it before dumping.
                dump_data = schematic.copy()
                dump_data.pop('file_path', None)
                dump_data.pop('server_id', None)
                dump_data.pop('id', None)
                
                json.dump(dump_data, f, indent=4)
        except Exception as e:
            self.error(f"Failed to write schematic {sch_id}: {e}")

        # Update Cache
        # We need to update the big dictionary
        server_data = self.cache._shared_data.get(server_id, {})
        if server_data and 'schematic_map' in server_data:
            # We copy, update, and reassign to trigger Manager sync
            s_map = server_data['schematic_map'].copy()
            s_map[sch_id] = schematic # This includes the new rankings
            server_data['schematic_map'] = s_map
            self.cache._shared_data[server_id] = server_data

    def _calculate_score(self, norm_stats, target_weights, available_stats):
        score = 0.0
        used_total_weight = 0.0
        
        for stat, weight in target_weights.items():
            if stat in available_stats:
                val = norm_stats.get(stat, 0)
                score += (val * weight)
                used_total_weight += weight
            # Else ignore (does not hurt)
        
        if used_total_weight == 0: return 0.0
        return score / used_total_weight

    def _extract_stats_breakdown(self, norm_stats, target_weights, available_stats):
        """Returns the specific stats used for this score."""
        breakdown = {}
        for stat in target_weights.keys():
            if stat in available_stats:
                val = norm_stats.get(stat, 0)
                breakdown[stat] = math.floor(val * 1000) / 1000.0
        return breakdown

    def _check_discord_alert(self, new_resource, best_list, current_list, schem_name, combo_key):
        # Only alert if the new resource ID is in top 3 of either list
        new_id = new_resource.get('id')
        
        found = False
        rank = 0
        list_type = ""

        # Check Current
        for i, item in enumerate(current_list[:3]):
            if item['id'] == new_id:
                found = True
                rank = i + 1
                list_type = "Current"
                break
        
        # Check Best (Overrides Current if found, usually implies both)
        if not found:
            for i, item in enumerate(best_list[:3]):
                if item['id'] == new_id:
                    found = True
                    rank = i + 1
                    list_type = "Best"
                    break
        
        if found:
            # TODO: Push to DiscordService
            # self.discord_queue.put(...)
            self.info(f"[Discord Stub] Resource {new_id} is Rank {rank} ({list_type}) for {schem_name} [{combo_key}]")