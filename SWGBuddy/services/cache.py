import logging
import os
import json
import glob
from multiprocessing import Manager
from SWGBuddy.core.database import DatabaseContext

logger = logging.getLogger(__name__)

class CacheManager:
    _instance = None
    _manager = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(CacheManager, cls).__new__(cls)
            cls._shared_data = None 
        return cls._instance
    
    def _is_initialized(self):
        return self._shared_data is not None

    def initialize(self):
        """
        Loads database tables and file-based schematics into memory.
        """
        if self._is_initialized():
            return

        if CacheManager._manager is None:
            CacheManager._manager = Manager()
        
        self._shared_data = CacheManager._manager.dict()
        
        try:
            # --- DATABASE LOADING (Existing Logic) ---
            DatabaseContext.initialize()

            with DatabaseContext.cursor() as cur:
                cur.execute("SELECT id, base_server FROM game_servers")
                server_map = {row['id']: row['base_server'] for row in cur.fetchall()}

                cur.execute("SELECT * FROM resource_weights")
                raw_weights = {}
                for row in cur.fetchall():
                    data = dict(row)
                    srv = data['server']
                    ctree = data['class_tree']
                    if srv not in raw_weights: 
                        raw_weights[srv] = {}
                    raw_weights[srv][ctree] = data

                cur.execute("SELECT class_tree, enum, label, is_valid, available_planets FROM resource_class ORDER BY class_tree ASC")
                taxonomy_defs = [dict(row) for row in cur.fetchall()]

            # --- SCHEMATIC LOADING (New Logic) ---
            # Resolve path: SWGBuddy/services/cache.py -> SWGBuddy/assets/schematics
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            schematics_root = os.path.join(base_dir, 'assets', 'schematics')
            
            raw_schematics = {} # { "cuemu": { "dessert_air_cake": {...content...} } }
            schematic_indices = {} # { "cuemu": [ {id, name, profession, category}... ] }

            # 1. Walk through every server folder found in assets/schematics
            if os.path.exists(schematics_root):
                server_dirs = [d for d in os.listdir(schematics_root) if os.path.isdir(os.path.join(schematics_root, d))]
                
                for srv_dir in server_dirs:
                    srv_path = os.path.join(schematics_root, srv_dir)
                    server_files = {}
                    server_index = []

                    # Recursive glob to find all .json files
                    json_files = glob.glob(os.path.join(srv_path, '**', '*.json'), recursive=True)

                    for json_path in json_files:
                        try:
                            with open(json_path, 'r', encoding='utf-8') as f:
                                data = json.load(f)
                            
                            # ID is the filename without extension (e.g. 'dessert_air_cake')
                            sch_id = os.path.splitext(os.path.basename(json_path))[0]
                            
                            # Add ID to the data object for consistency
                            data['id'] = sch_id

                            # Store Full Data
                            server_files[sch_id] = data

                            # Build Index Entry
                            server_index.append({
                                'id': sch_id,
                                'name': data.get('custom_object_name', sch_id),
                                'profession': data.get('base_profession', 'Unknown'),
                                'category': data.get('category', 'Uncategorized')
                            })
                        except Exception as e:
                            logger.warning(f"Failed to load schematic {json_path}: {e}")

                    raw_schematics[srv_dir] = server_files
                    schematic_indices[srv_dir] = sorted(server_index, key=lambda x: x['name'])

            # --- BUILD SHARED CACHE ---
            for server_id, base_server in server_map.items():
                
                # ... (Existing Taxonomy Logic) ...
                taxonomy = {}
                valid_resources = {}
                filter_list = {}
                base_weights = raw_weights.get(base_server, {})

                for node in taxonomy_defs:
                    class_tree = node['class_tree']
                    # ... (Existing Inheritance Code A & B) ...
                    # Re-implementing simplified version for brevity in this snippet
                    # In real code, keep your existing logic here intact.
                    
                    # (Simplified Inheritance for Context)
                    resolved_stats = {}
                    parts = class_tree.split('.')
                    paths = ['.'.join(parts[:i+1]) for i in reversed(range(len(parts)))]
                    found_row = next((base_weights[p] for p in paths if p in base_weights), None)
                    
                    if found_row:
                        for i in range(1, 12):
                            k = f'attr{i}'
                            if found_row.get(k):
                                resolved_stats[found_row[k]] = {'min': found_row.get(f'{k}_min'), 'max': found_row.get(f'{k}_max')}

                    resource_obj = {
                        "label": node['label'],
                        "enum": node['enum'],
                        "is_valid": node['is_valid'],
                        "stats": resolved_stats,
                        "planets": node['available_planets'] if node['is_valid'] else []
                    }
                    taxonomy[class_tree] = resource_obj
                    filter_list[class_tree] = node['label']
                    if node['is_valid']:
                        valid_resources[class_tree] = resource_obj

                # --- MERGE SCHEMATICS ---
                # Logic: Check specific server folder first, fallback to base_server?
                # For now, we load strictly from the server_id folder to match the file structure.
                # If you want inheritance (e.g. cuemu uses core3 schems), logic goes here.
                
                # Current Logic: Direct Lookup
                my_schem_index = schematic_indices.get(server_id, [])
                my_schem_map = raw_schematics.get(server_id, {})

                # Fallback Logic (Optional): If empty, try base_server
                if not my_schem_index and base_server in schematic_indices:
                     my_schem_index = schematic_indices[base_server]
                     my_schem_map = raw_schematics[base_server]

                self._shared_data[server_id] = {
                    "taxonomy": taxonomy,
                    "valid_resources": valid_resources,
                    "filter_flatlist": filter_list,
                    "schematic_index": my_schem_index,
                    "schematic_map": my_schem_map
                }

            logger.info(f"Shared CacheManager initialized for {len(server_map)} servers.")

        except Exception as e:
            logger.error(f"Cache initialization failed: {e}")
            raise e

    def get_server_data(self, server_id):
        return self._shared_data.get(server_id, {})