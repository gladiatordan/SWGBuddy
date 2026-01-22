import os
import json
import logging
import traceback
import itertools
from queue import Empty
from core.core import Core
from core.database import DatabaseContext

class RankingService(Core):
    SCHEMATICS_DIR = "./assets/schematics"  # Adjust if your build_schematics outputs elsewhere

    def __init__(self, input_queue, log_queue, discord_queue, cache):
        super().__init__(log_queue)
        self.input_queue = input_queue
        self.discord_queue = discord_queue
        self.cache = cache
        self.running = True
        self.schematic_definitions = {} # Local copy of definitions

    def run(self):
        DatabaseContext.initialize()
        self.info("Initializing Ranking Service...")

        # 1. Load Schematics from Disk & Init Cache
        self._initialize_schematics()

        # 2. Perform Initial Ranking Sweep (Optional: Can be heavy on startup)
        # self._perform_initial_sweep() 

        self.info("Ranking Service Ready.")

        while self.running:
            try:
                # Block for 1 second so we can check self.running gracefully
                message = self.input_queue.get(timeout=1)
                if message is None: break
                self._process_message(message)
            except Empty:
                continue
            except KeyboardInterrupt:
                self.running = False
            except Exception as e:
                self.error(f"Ranking Loop Crash: {e}\n{traceback.format_exc()}")

    # ----------------------------------------------------------------------
    # INITIALIZATION
    # ----------------------------------------------------------------------
    def _initialize_schematics(self):
        """
        Loads all generated JSON schematics, builds the permutation keys,
        and pushes the structure to the Shared Cache.
        """
        if not os.path.exists(self.SCHEMATICS_DIR):
            self.warning(f"Schematics directory not found: {self.SCHEMATICS_DIR}")
            return

        cache_update = {}
        count = 0

        for filename in os.listdir(self.SCHEMATICS_DIR):
            if not filename.endswith(".json"): continue
            
            try:
                fp = os.path.join(self.SCHEMATICS_DIR, filename)
                with open(fp, 'r') as f:
                    data = json.load(f)
                
                schematic_id = os.path.splitext(filename)[0]
                
                # 1. Store Definition Locally (for calculations)
                self.schematic_definitions[schematic_id] = data

                # 2. Build Cache Structure (for Frontend)
                # We need to pre-generate keys for every combination of experimental categories
                rankings_skeleton = self._generate_combinatorial_keys(data.get('experimentalGroupTitles'))
                
                cache_update[schematic_id] = {
                    "id": schematic_id,
                    "name": data.get('customObjectName', 'Unknown Schematic'),
                    "profession": "Crafting", # You might want to extract this from path or data later
                    "category": "Item",       # Same here
                    "details": data,          # Full schematic data
                    "rankings": rankings_skeleton
                }
                count += 1

            except Exception as e:
                self.error(f"Failed to load schematic {filename}: {e}")

        # Push to Shared Memory
        # Note: We assume cache._shared_data is a Manager.dict()
        # We need to be careful about atomic updates if possible, 
        # but for initialization, direct assignment is usually fine.
        try:
            # We access the internal shared dict. 
            # In production, we might want a setter method on CacheManager.
            if self.cache._shared_data is not None:
                # We nest this under a 'schematics' key. 
                # Since _shared_data is multiprocess dict, we update it specifically.
                # Assuming 'cuemu' or global? Schematics are usually global unless customized per server.
                # For now, let's put it in a global 'schematics' key or inject into every server.
                # Let's start with a top-level key for now.
                self.cache._shared_data['schematics'] = cache_update
                self.info(f"Loaded {count} schematics into shared cache.")
            else:
                self.error("Shared Cache is not initialized!")
        except Exception as e:
            self.error(f"Failed to update shared cache: {e}")

    def _generate_combinatorial_keys(self, exp_groups):
        """
        Generates the 'rankings' dictionary skeleton with keys for every permutation.
        exp_groups example: [{"name": "Damage", ...}, {"name": "Efficiency", ...}]
        """
        skeleton = {}
        if not exp_groups:
            # No experiments, just a default key
            return {"default": {"current": [], "best": []}}

        # Extract IDs or Titles to form keys
        # Assuming build_schematics outputs a list of dictionaries or strings
        # Adjust logic based on exact JSON structure from build_schematics.py
        # For this example, I assume exp_groups is a list of title strings or dicts
        
        # If exp_groups are complex objects, we need a stable ID. 
        # Using index or title. Let's use Title for readability if unique.
        cats = []
        for idx, group in enumerate(exp_groups):
            # Handle if group is string or object
            title = group.get('title') if isinstance(group, dict) else str(group)
            # Create a simple slug ID
            cat_id = f"exp_{title.lower().replace(' ', '_')}"
            cats.append(cat_id)

        # Generate Power Set (All combinations of 1..N items)
        for r in range(1, len(cats) + 1):
            for combo in itertools.combinations(cats, r):
                # Sort to ensure "dmg|eff" is same as "eff|dmg"
                sorted_combo = sorted(combo)
                key = "|".join(sorted_combo)
                skeleton[key] = {
                    "current": [],
                    "best": []
                }
        
        return skeleton

    # ----------------------------------------------------------------------
    # PROCESSING LOGIC
    # ----------------------------------------------------------------------
    def _process_message(self, packet):
        action = packet.get('action')
        
        if action == "rank_resource":
            self._handle_rank_resource(packet)
        else:
            self.warning(f"Unknown action: {action}")

    def _handle_rank_resource(self, packet):
        """
        Recalculates rankings for all schematics affected by a specific resource update.
        """
        resource_id = packet.get('resource_id')
        class_tree = packet.get('class_tree')
        stats = packet.get('stats', {})
        
        # 1. Identify Affected Schematics
        # In a real impl, we'd use an Inverted Index here.
        # For MVP, we might iterate all (slow) or use a simple lookup if built.
        # self.info(f"Ranking resource {resource_id} ({class_tree})...")

        # 2. Iterate Schematics and Score
        # ... logic to find matching slots ...
        # ... logic to calculate score ...
        
        # 3. Update Cache if Top 10
        # ... logic to update cache ...

        # 4. Notification Check
        # if new_rank == 1:
        #     self._send_discord_alert(resource_id, schematic_name, ...)
        pass

    def _calculate_score(self, resource_stats, slot_weights):
        """
        Standard SWG Weighted Average Formula.
        resource_stats: { 'res_quality': 900, ... }
        slot_weights: { 'res_quality': 1.0 } (Normalized)
        """
        score = 0
        total_weight = 0
        
        for stat, weight in slot_weights.items():
            val = resource_stats.get(stat, 0)
            # Cap is usually 1000 for standard resources
            score += (val / 1000.0) * weight
            total_weight += weight
            
        if total_weight == 0: return 0
        
        # Normalize result to 0-1000 range
        return int((score / total_weight) * 1000)

    # ----------------------------------------------------------------------
    # NOTIFICATIONS
    # ----------------------------------------------------------------------
    def _send_discord_alert(self, resource_data, schematic_name, rank_type):
        """
        Pushes a payload to the DiscordService to announce a new best resource.
        """
        # payload = {
        #     "type": "ranking_alert",
        #     "channel": "resources",
        #     "data": {
        #         "resource": resource_data,
        #         "schematic": schematic_name,
        #         "rank_type": rank_type # 'Best Current' or 'Best Ever'
        #     }
        # }
        # self.discord_queue.put(payload)
        pass