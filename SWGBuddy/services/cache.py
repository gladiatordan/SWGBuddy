import logging
from multiprocessing import Manager
from SWGBuddy.core.database import DatabaseContext

logger = logging.getLogger(__name__)

class CacheManager:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(CacheManager, cls).__new__(cls)
            cls._manager = Manager()
            # Shared dictionary structure: 
            # { "server_id": { "taxonomy": {...}, "valid_resources": {...}, "filter_list": {...} } }
            cls._shared_data = cls._manager.dict()
        return cls._instance

    def initialize(self):
        """
        Loads database tables, resolves inheritance, and builds optimized frontend structures.
        Call this ONCE from main.py before starting child processes.
        """
        try:
            # Ensure pool is created (though cursor() will also do it)
            DatabaseContext.initialize()

            with DatabaseContext.cursor() as cur:
                # 1. Map Registered Servers -> Base Type (live vs core3)
                cur.execute("SELECT id, base_server FROM game_servers")
                # RealDictCursor returns dict-like rows; access by column name
                server_map = {row['id']: row['base_server'] for row in cur.fetchall()}

                # 2. Load Raw Weights: { "live": { "1.2.3": {attr1: 'res_quality'...} } }
                cur.execute("SELECT * FROM resource_weights")
                raw_weights = {}
                
                for row in cur.fetchall():
                    data = dict(row) # Convert RealDictRow to standard dict
                    srv = data['server']
                    ctree = data['class_tree'] # e.g. "1.2.3"
                    if srv not in raw_weights: 
                        raw_weights[srv] = {}
                    raw_weights[srv][ctree] = data

                # 3. Load Taxonomy Definitions
                cur.execute("SELECT class_tree, enum, label, is_valid, available_planets FROM resource_class ORDER BY class_tree ASC")
                taxonomy_defs = [dict(row) for row in cur.fetchall()]

            # 4. Build Optimized Caches Per Server
            for server_id, base_server in server_map.items():
                
                taxonomy = {}        # Full lookup: "1.2.3" -> { label, stats... }
                valid_resources = {} # Only valid leaf nodes: "1.2.3" -> { label, stats... }
                filter_list = {}     # Simple dropdown map: "1.2.3" -> "Label"

                base_weights = raw_weights.get(base_server, {})

                for node in taxonomy_defs:
                    class_tree = node['class_tree']
                    
                    # --- A. Inheritance Logic (Crawl Up) ---
                    # If "1.2.3" has no weights, check "1.2", then "1".
                    resolved_stats = {}
                    
                    # Generate path segments: "1.2.3" -> ["1.2.3", "1.2", "1"]
                    parts = class_tree.split('.')
                    paths_to_check = ['.'.join(parts[:i+1]) for i in reversed(range(len(parts)))]
                    
                    found_weight_row = None
                    for path in paths_to_check:
                        if path in base_weights:
                            found_weight_row = base_weights[path]
                            break # Found nearest parent definition
                    
                    # Format attributes into frontend-friendly object
                    if found_weight_row:
                        for i in range(1, 12): # attr1 to attr11
                            attr_key = f'attr{i}'
                            attr_name = found_weight_row.get(attr_key)
                            
                            if attr_name:
                                attr_min = found_weight_row.get(f'{attr_key}_min')
                                attr_max = found_weight_row.get(f'{attr_key}_max')
                                # Only add if we have a valid name
                                resolved_stats[attr_name] = {'min': attr_min, 'max': attr_max}

                    # --- B. Build Resource Object ---
                    resource_obj = {
                        "label": node['label'],
                        "enum": node['enum'],
                        "is_valid": node['is_valid'],
                        "stats": resolved_stats,
                        "planets": node['available_planets'] if node['is_valid'] else []
                    }

                    # --- C. Populate Dictionaries ---
                    taxonomy[class_tree] = resource_obj
                    filter_list[class_tree] = node['label']

                    if node['is_valid']:
                        valid_resources[class_tree] = resource_obj

                # Save to shared memory
                self._shared_data[server_id] = {
                    "taxonomy": taxonomy,
                    "valid_resources": valid_resources,
                    "filter_flatlist": filter_list
                }

            logger.info(f"Shared CacheManager initialized for {len(server_map)} servers.")

        except Exception as e:
            logger.error(f"Cache initialization failed: {e}")
            raise e

    def get_server_data(self, server_id):
        """Returns the entire data bundle for a server."""
        return self._shared_data.get(server_id, {})