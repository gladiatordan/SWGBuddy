import os
import json
import traceback
import itertools
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

    def run(self):
        DatabaseContext.initialize()
        self.info("Initializing Ranking Service...")
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

    def _initialize_schematics(self):
        if not os.path.exists(self.SCHEMATICS_DIR):
            self.warning(f"Schematics directory not found: {self.SCHEMATICS_DIR}")
            return

        cache_update = {}
        count = 0

        # Walk through all subdirectories to find JSONs (e.g. cuemu/food/...)
        for root, dirs, files in os.walk(self.SCHEMATICS_DIR):
            for filename in files:
                if not filename.endswith(".json"): continue
                
                try:
                    fp = os.path.join(root, filename)
                    with open(fp, 'r') as f:
                        data = json.load(f)
                    
                    schematic_id = os.path.splitext(filename)[0]
                    
                    # Store Definition Locally
                    self.schematic_definitions[schematic_id] = data

                    # Build Cache Structure
                    # 1. Generate keys from 'experiment_weights' keys
                    exp_keys = list(data.get('experiment_weights', {}).keys())
                    rankings_skeleton = self._generate_combinatorial_keys(exp_keys)
                    
                    # 2. Extract Metadata
                    cache_update[schematic_id] = {
                        "id": schematic_id,
                        "name": data.get('custom_object_name', 'Unknown Schematic'),
                        "profession": data.get('base_profession', 'Crafting'),
                        "category": data.get('category', 'Item'),
                        "details": data, 
                        "rankings": rankings_skeleton
                    }
                    count += 1

                except Exception as e:
                    self.error(f"Failed to load schematic {filename}: {e}")

        try:
            if self.cache._shared_data is not None:
                self.cache._shared_data['schematics'] = cache_update
                self.info(f"Loaded {count} schematics into shared cache.")
            else:
                self.error("Shared Cache is not initialized!")
        except Exception as e:
            self.error(f"Failed to update shared cache: {e}")

    def _generate_combinatorial_keys(self, exp_titles):
        """
        Generates the 'rankings' dictionary skeleton.
        exp_titles: list of strings e.g. ["Experimental Nutritional Value", "Experimental Flavor"]
        """
        skeleton = {}
        if not exp_titles:
            return {"default": {"current": [], "best": []}}

        # Create stable IDs for the categories
        cats = []
        for title in exp_titles:
            cat_id = f"exp_{title.lower().replace(' ', '_')}"
            cats.append(cat_id)

        # Generate Power Set
        for r in range(1, len(cats) + 1):
            for combo in itertools.combinations(cats, r):
                sorted_combo = sorted(combo)
                key = "|".join(sorted_combo)
                skeleton[key] = {
                    "current": [],
                    "best": []
                }
        
        return skeleton

    def _process_message(self, packet):
        action = packet.get('action')
        if action == "rank_resource":
            self._handle_rank_resource(packet)

    def _handle_rank_resource(self, packet):
        pass

    def _calculate_score(self, resource_stats, slot_weights):
        pass

    def _send_discord_alert(self, resource_data, schematic_name, rank_type):
        pass