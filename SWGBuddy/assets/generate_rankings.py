import csv
import json
import os
import glob
import math
from itertools import combinations

# --- CONFIGURATION ---
SERVER_ID = 'cuemu' 
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMATICS_DIR = os.path.join(DATA_DIR, 'schematics')

# --- DATA LOADERS ---

def get_server_hierarchy(target_server_id):
    filepath = os.path.join(DATA_DIR, 'game_servers.csv')
    if not os.path.exists(filepath):
        print(f"[Warn] game_servers.csv not found. Defaulting to {target_server_id} only.")
        return [target_server_id]

    hierarchy = [target_server_id]
    try:
        with open(filepath, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['id'] == target_server_id:
                    base = row.get('base_server')
                    if base and base != target_server_id:
                        hierarchy.append(base)
                    break
    except Exception as e:
        print(f"[Error] Failed to parse game_servers.csv: {e}")
    return hierarchy

def load_resource_weights(server_hierarchy):
    filepath = os.path.join(DATA_DIR, 'resource_weights.csv')
    weights_map = {}
    if not os.path.exists(filepath): return {}

    print(f"Loading weights for servers: {server_hierarchy}...")
    with open(filepath, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['server'] not in server_hierarchy: continue
            
            caps = {}
            available_stats = set()
            for i in range(1, 12):
                attr_name = row.get(f'attr{i}')
                if attr_name:
                    available_stats.add(attr_name)
                    try:
                        caps[attr_name] = int(row.get(f'attr{i}_max', 1000))
                    except ValueError:
                        caps[attr_name] = 1000
            
            weights_map[row['class_tree']] = {
                'caps': caps,
                'stats': available_stats
            }
    return weights_map

def load_resource_class_lookup():
    filepath = os.path.join(DATA_DIR, 'resource_class.csv')
    lookup = {}
    if not os.path.exists(filepath): return {}
    with open(filepath, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            lookup[row['enum']] = row['class_tree']
            lookup[row['label'].lower()] = row['class_tree']
            lookup[row['class_tree']] = row['class_tree']
    return lookup

def load_resource_log():
    filepath = os.path.join(DATA_DIR, 'resource_log.csv')
    resources = []
    if not os.path.exists(filepath): return []
    with open(filepath, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['server_id'] != SERVER_ID: continue
            for key, val in row.items():
                if key.startswith('res_') and not key.endswith('_rating'):
                    try: row[key] = int(val) if val else 0
                    except ValueError: row[key] = 0
            row['is_active'] = (row['is_active'] == 'TRUE')
            resources.append(row)
    return resources

# --- SCORING LOGIC ---

def normalize_resource(resource, caps):
    normalized = {}
    for stat, max_val in caps.items():
        val = resource.get(stat, 0)
        if max_val == 0: normalized[stat] = 0
        else:
            score = float(val) / float(max_val)
            normalized[stat] = min(score, 1.0)
    return normalized

def calculate_adjusted_score(normalized_stats, weight_vector, resource_available_stats):
    score = 0.0
    used_total_weight = 0.0
    for stat, weight in weight_vector.items():
        if stat in resource_available_stats:
            stat_score = normalized_stats.get(stat, 0)
            score += (stat_score * weight)
            used_total_weight += weight
    if used_total_weight == 0: return 0.0
    return (score / used_total_weight)

def generate_combinations(categories):
    cat_ids = [c['id'] for c in categories]
    combos = [[]]
    for r in range(1, len(cat_ids) + 1):
        for subset in combinations(cat_ids, r):
            combos.append(sorted(list(subset)))
    return combos

def get_weight_vector_for_combo(combo_ids, categories):
    final_weights = {}
    for cat_id in combo_ids:
        cat_def = next((c for c in categories if c['id'] == cat_id), None)
        if not cat_def: continue
        for stat, weight in cat_def['weights'].items():
            final_weights[stat] = final_weights.get(stat, 0) + weight
    return final_weights

# --- MAIN EXECUTION ---

def process_schematics():
    print(f"Initializing for Server: {SERVER_ID}")
    server_hierarchy = get_server_hierarchy(SERVER_ID)
    
    print("Loading Database...")
    weights_db = load_resource_weights(server_hierarchy)
    class_lookup = load_resource_class_lookup()
    resource_db = load_resource_log()
    print(f"Loaded {len(resource_db)} active resources log entries.")

    json_files = glob.glob(os.path.join(SCHEMATICS_DIR, '**/*.json'), recursive=True)
    
    for json_path in json_files:
        print(f"Processing {os.path.basename(json_path)}...")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            schematic = json.load(f)

        if 'slots' not in schematic: continue

        unique_ingredients = {}
        for slot_name, slot_data in schematic['slots'].items():
            if slot_data.get('slot_type') != 0: continue
            ing_name = slot_data.get('ingredient', 'Unknown')
            tree_id = class_lookup.get(ing_name) or class_lookup.get(ing_name.lower())
            if not tree_id and ing_name.replace('.','').isdigit(): tree_id = ing_name 
            if tree_id: unique_ingredients[ing_name] = tree_id

        rankings_output = {}
        exp_cats = []
        if 'experiment_weights' in schematic:
            for label, weights in schematic['experiment_weights'].items():
                exp_cats.append({
                    'id': f"exp_{label.lower().replace(' ', '_')}",
                    'weights': weights
                })
        
        combos = generate_combinations(exp_cats)

        for ing_key, req_tree_id in unique_ingredients.items():
            rankings_output[ing_key] = {}
            constraint_data = weights_db.get(req_tree_id)
            if not constraint_data: continue

            slot_caps = constraint_data['caps']
            slot_available_stats = constraint_data['stats'] 

            candidates = [r for r in resource_db if r['class_tree'].startswith(req_tree_id)]
            
            pre_normalized_candidates = []
            for res in candidates:
                pre_normalized_candidates.append({
                    'data': res,
                    'norm': normalize_resource(res, slot_caps)
                })

            for combo in combos:
                combo_key = "|".join(combo) if combo else "default"
                target_weights = get_weight_vector_for_combo(combo, exp_cats)
                
                scored_list = []
                for item in pre_normalized_candidates:
                    res = item['data']
                    norm_stats = item['norm']
                    final_score = calculate_adjusted_score(norm_stats, target_weights, slot_available_stats)
                    
                    # Extract Stats Breakdown
                    relevant_stats = {}
                    for stat, weight in target_weights.items():
                        if stat in slot_available_stats:
                            val = norm_stats.get(stat, 0)
                            relevant_stats[stat] = math.floor(val * 1000) / 1000.0

                    final_score = math.floor(final_score * 1000) / 1000.0
                    
                    if final_score > 0:
                        scored_list.append({
                            'id': res['id'],
                            'rating': f"{final_score:.1%}", 
                            'raw_score': final_score,
                            'stats': relevant_stats,
                            'is_active': res['is_active'] # Pass through for filtering
                        })

                # Sort Global
                scored_list.sort(key=lambda x: x['raw_score'], reverse=True)
                
                # --- RANK ASSIGNMENT ---
                
                # 1. Best List (Top 10 All Time)
                best_list = []
                for i, item in enumerate(scored_list[:10]):
                    entry = item.copy()
                    entry['rank'] = i + 1
                    # Remove internal flag if desired, but harmless to keep
                    del entry['is_active'] 
                    best_list.append(entry)
                
                # 2. Current List (Top 10 Active)
                current_list = []
                active_items = [x for x in scored_list if x['is_active']]
                for i, item in enumerate(active_items[:10]):
                    entry = item.copy()
                    entry['rank'] = i + 1 # Rank in the CURRENT list (1st, 2nd...)
                    del entry['is_active']
                    current_list.append(entry)

                rankings_output[ing_key][combo_key] = {
                    "best": best_list,
                    "current": current_list
                }

        schematic['rankings'] = rankings_output
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(schematic, f, indent=4)
            
    print("Generation Complete.")

if __name__ == "__main__":
    process_schematics()