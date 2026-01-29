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
        self.ingredient_lookup = {} 

    def run(self):
        DatabaseContext.initialize()
        self.info("Initializing Ranking Service...")
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
        if self.cache._shared_data is None: return
        for server_id, data in self.cache._shared_data.items():
            if server_id == 'schematics': continue
            taxonomy = data.get('taxonomy', {})
            server_lookup = {}
            for class_tree, details in taxonomy.items():
                if details.get('enum'): server_lookup[details['enum']] = class_tree
                if details.get('label'): server_lookup[details['label'].lower()] = class_tree
                server_lookup[class_tree] = class_tree
            if server_id not in self.ingredient_lookup:
                self.ingredient_lookup[server_id] = server_lookup

    def _initialize_schematics(self):
        if not os.path.exists(self.SCHEMATICS_DIR):
            self.warning(f"Schematics directory not found: {self.SCHEMATICS_DIR}")
            return

        count = 0
        for root, dirs, files in os.walk(self.SCHEMATICS_DIR):
            for filename in files:
                if not filename.endswith(".json"): continue
                parts = os.path.normpath(root).split(os.sep)
                try:
                    idx = parts.index('schematics')
                    server_id = parts[idx + 1] if len(parts) > idx + 1 else 'common'
                except ValueError:
                    server_id = 'common'

                try:
                    fp = os.path.join(root, filename)
                    with open(fp, 'r') as f:
                        data = json.load(f)
                    
                    schematic_id = os.path.splitext(filename)[0]
                    data['id'] = schematic_id
                    data['server_id'] = server_id
                    data['file_path'] = fp 

                    if server_id not in self.schematic_definitions:
                        self.schematic_definitions[server_id] = {}
                    
                    self.schematic_definitions[server_id][schematic_id] = data
                    count += 1
                except Exception as e:
                    self.error(f"Failed to load schematic {filename}: {e}")

        # Sync with CacheManager
        try:
            if self.cache._shared_data is not None:
                for srv, schems in self.schematic_definitions.items():
                    existing_data = self.cache.get_server_data(srv)
                    if existing_data:
                        existing_data['schematic_map'] = schems
                        self.cache._shared_data[srv] = existing_data
                self.info(f"Loaded {count} schematics into shared cache.")
        except Exception as e:
            self.error(f"Failed to update shared cache: {e}")

    def _generate_combinatorial_keys(self, exp_titles):
        if not exp_titles: return [("default", [])]
        cats = [{"id": f"exp_{t.lower().replace(' ', '_')}", "title": t} for t in exp_titles]
        combos = [("default", [])]
        for r in range(1, len(cats) + 1):
            for subset in itertools.combinations(cats, r):
                sorted_ids = sorted([c['id'] for c in subset])
                combos.append(("|".join(sorted_ids), subset))
        return combos

    def _process_message(self, packet):
        action = packet.get('action')
        
        if action == "rank_resource":
            self._handle_rank_resource(packet)
        elif action == "recalculate_rankings":
            self._handle_recalculate_all(packet)

    def _handle_rank_resource(self, packet):
        resource = packet.get('resource')
        server_id = packet.get('server_id')
        if not resource or not server_id: return

        res_class = resource.get('class_tree')
        if not res_class: return

        lookup = self.ingredient_lookup.get(server_id, {})
        affected_schematics = [] 
        server_schematics = self.schematic_definitions.get(server_id, {})
        
        for sch_id, schem_data in server_schematics.items():
            slots = schem_data.get('slots', {})
            for slot_name, slot_def in slots.items():
                if slot_def.get('slot_type') != 0: continue
                
                ing_str = slot_def.get('ingredient')
                req_id = lookup.get(ing_str) or lookup.get(ing_str.lower())
                if not req_id and ing_str.replace('.', '').isdigit(): req_id = ing_str
                
                if req_id and res_class.startswith(req_id):
                    affected_schematics.append((sch_id, slot_name, ing_str, req_id))

        if not affected_schematics:
            self.info(f"Resource {resource.get('name')} affects no schematics.")
            return

        self.info(f"Resource {resource.get('name')} triggers update for {len(affected_schematics)} schematics.")
        
        for sch_id, slot_name, ing_name, req_tree_id in affected_schematics:
            self._update_schematic_ranking(server_id, sch_id, ing_name, req_tree_id, resource)

    def _handle_recalculate_all(self, packet):
        server_id = packet.get('server_id')
        if not server_id: return
        
        schematics = self.schematic_definitions.get(server_id, {})
        lookup = self.ingredient_lookup.get(server_id, {}) 
        
        self.info(f"Starting full recalculation for {server_id} ({len(schematics)} schematics)...")
        
        count = 0
        for sch_id, schem_data in schematics.items():
            slots = schem_data.get('slots', {})
            for slot_name, slot_def in slots.items():
                if slot_def.get('slot_type') != 0: continue # Only resources
                
                ing_str = slot_def.get('ingredient')
                # Resolve ingredient string to class tree ID
                req_id = lookup.get(ing_str) or lookup.get(ing_str.lower())
                if not req_id and ing_str.replace('.', '').isdigit(): req_id = ing_str
                
                if req_id:
                    # Update this slot. Pass None for new_resource to skip alerts.
                    self._update_schematic_ranking(server_id, sch_id, ing_str, req_id, None)
            
            count += 1
            if count % 10 == 0:
                self.info(f"Recalculated {count}/{len(schematics)}...")

        self.info(f"Full recalculation complete for {server_id}.")

    def _update_schematic_ranking(self, server_id, sch_id, ing_key, req_tree_id, new_resource):
        schematic = self.schematic_definitions[server_id][sch_id]
        
        experiment_weights = schematic.get('experiment_weights', {})
        exp_keys = list(experiment_weights.keys())
        combos = self._generate_combinatorial_keys(exp_keys)

        if 'rankings' not in schematic: schematic['rankings'] = {}
        if ing_key not in schematic['rankings']: schematic['rankings'][ing_key] = {}

        sql = """
            SELECT id, class_tree, is_active,
                   res_quality, res_decay_resist, res_flavor, res_potential_energy,
                   res_malleability, res_toughness, res_shock_resistance,
                   res_cold_resist, res_heat_resist, res_conductivity, entangle_resistance
            FROM resource_log
            WHERE server_id = %s AND class_tree LIKE %s
        """
        with DatabaseContext.cursor() as cur:
            cur.execute(sql, (server_id, f"{req_tree_id}%"))
            candidates = cur.fetchall()

        taxonomy = self.cache.get_server_data(server_id).get('taxonomy', {})
        slot_def = taxonomy.get(req_tree_id, {})
        slot_caps = {}
        available_stats = set()
        
        if slot_def and 'stats' in slot_def:
            for stat_k, stat_v in slot_def['stats'].items():
                available_stats.add(stat_k)
                slot_caps[stat_k] = stat_v['max']
        else:
            # Fallback
            from services.validation import ValidationService
            slot_caps = {k: 1000 for k in ValidationService.STAT_COLS}
            available_stats = set(ValidationService.STAT_COLS)

        pre_norm = []
        for cand in candidates:
            norm = {}
            for stat, cap in slot_caps.items():
                val = cand.get(stat)
                if val is None: val = 0
                score = float(val) / float(cap) if cap > 0 else 0
                norm[stat] = min(score, 1.0)
            pre_norm.append({'data': cand, 'norm': norm})

        for combo_key, subset_cats in combos:
            target_weights = {}
            for cat_info in subset_cats:
                w = experiment_weights.get(cat_info['title'], {})
                for stat, weight in w.items():
                    target_weights[stat] = target_weights.get(stat, 0) + weight

            scored_list = []
            for item in pre_norm:
                score = self._calculate_score(item['norm'], target_weights, available_stats)
                final_score = math.floor(score * 1000) / 1000.0
                
                if final_score > 0:
                    scored_list.append({
                        'id': item['data']['id'],
                        'rating': f"{final_score:.1%}",
                        'raw_score': final_score,
                        'stats': self._extract_stats_breakdown(item['norm'], target_weights, available_stats),
                        'is_active': item['data']['is_active']
                    })

            scored_list.sort(key=lambda x: x['raw_score'], reverse=True)

            # --- RANK ASSIGNMENT ---
            
            # Best List (Top 10 All Time)
            best_list = []
            for i, item in enumerate(scored_list[:10]):
                entry = item.copy()
                entry['rank'] = i + 1
                del entry['is_active'] 
                best_list.append(entry)
            
            # Current List (Top 10 Active)
            current_list = []
            active_items = [x for x in scored_list if x['is_active']]
            for i, item in enumerate(active_items[:10]):
                entry = item.copy()
                entry['rank'] = i + 1
                del entry['is_active']
                current_list.append(entry)

            self._check_discord_alert(new_resource, best_list, current_list, schematic['custom_object_name'], combo_key)

            schematic['rankings'][ing_key][combo_key] = {
                "best": best_list,
                "current": current_list
            }

        schematic['last_updated'] = int(time.time())

        try:
            with open(schematic['file_path'], 'w', encoding='utf-8') as f:
                dump_data = schematic.copy()
                dump_data.pop('file_path', None)
                dump_data.pop('server_id', None)
                dump_data.pop('id', None)
                json.dump(dump_data, f, indent=4)
        except Exception as e:
            self.error(f"Failed to write schematic {sch_id}: {e}")

        server_data = self.cache._shared_data.get(server_id, {})
        if server_data and 'schematic_map' in server_data:
            s_map = server_data['schematic_map'].copy()
            s_map[sch_id] = schematic
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
        if used_total_weight == 0: return 0.0
        return score / used_total_weight

    def _extract_stats_breakdown(self, norm_stats, target_weights, available_stats):
        breakdown = {}
        for stat in target_weights.keys():
            if stat in available_stats:
                val = norm_stats.get(stat, 0)
                breakdown[stat] = math.floor(val * 1000) / 1000.0
        return breakdown

    def _check_discord_alert(self, new_resource, best_list, current_list, schem_name, combo_key):
        if not new_resource: return 
        new_id = new_resource.get('id')
        found = False
        rank = 0
        list_type = ""

        # Check Current Top 3
        for item in current_list[:3]:
            if item['id'] == new_id:
                found = True
                rank = item['rank']
                list_type = "Current"
                break
        
        # Check Best Top 3 (if not found in current or to allow double alert logic if you want)
        if not found:
            for item in best_list[:3]:
                if item['id'] == new_id:
                    found = True
                    rank = item['rank']
                    list_type = "Best"
                    break
        
        if found:
            # Future: self.discord_queue.put(...)
            self.info(f"[Discord Stub] Resource {new_id} achieved Rank {rank} ({list_type}) for {schem_name} [{combo_key}]")