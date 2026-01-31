"""
SWGBuddy ValidationService Module
Updated for resource_log schema and class_tree taxonomy.
"""
import sys
import time
import re
import json
import os
import traceback
from core.core import Core
from core.database import DatabaseContext

class ValidationService(Core):
	# Role Power Levels
	ROLE_HIERARCHY = {
		'SUPERADMIN': 100,
		'ADMIN': 3,
		'EDITOR': 2,
		'USER': 1,
		'GUEST': 0
	}

	# UPDATED: Maps JSON keys to NEW DB Columns
	STAT_COLS = [
		"res_quality", "res_decay_resist", "res_flavor", 
		"res_potential_energy", "res_malleability", "res_toughness", 
		"res_shock_resistance", "res_cold_resist", "res_heat_resist", 
		"res_conductivity", "entangle_resistance"
	]

	# Added ranking_queue to signature
	def __init__(self, input_queue, log_queue, reply_queue, ranking_queue, cache):
		super().__init__(log_queue)
		self.input_queue = input_queue
		self.reply_queue = reply_queue
		self.cache = cache
		self.ranking_queue = ranking_queue
		self.running = True

	def run(self):
		DatabaseContext.initialize()
		self.info("Initializing Validation Service...")

		try:
			self._hydrate_permissions()
		except Exception as e:
			self.critical(f"FATAL: Failed to hydrate permissions: {e}")
			return

		self.info("Validation Service Ready.")

		while self.running:
			try:
				message = self.input_queue.get()
				if message is None: break
				self._process_message(message)
			except KeyboardInterrupt:
				self.running = False
			except Exception as e:
				self.error(f"Worker Loop Crash: {e}\n{traceback.format_exc()}")

	def _hydrate_permissions(self):
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT command, min_role_level FROM command_permissions")
			rows = cur.fetchall()
		self.command_permissions = {r['command']: r['min_role_level'] for r in rows}

	# ----------------------------------------------------------------------
	# MESSAGE PROCESSING
	# ----------------------------------------------------------------------
	def _process_message(self, packet):
		action = packet.get('action')
		payload = packet.get('payload') or {}
		user_ctx = packet.get('user_context', {})
		server_id = packet.get('server_id', 'cuemu')
		correlation_id = packet.get('id')
		
		response = {"id": correlation_id, "status": "success", "error": None}

		try:
			required_power = self.command_permissions.get(action, 100)
			if action == 'sync_user': required_power = 0

			if required_power > 0:
				is_allowed, user_role = self._check_permission(user_ctx, server_id, required_power)
				if not is_allowed:
					raise PermissionError(f"Insufficient Permissions.")

			if action == "sync_user":
				self._sync_user(payload)

			elif action == "add_resource":
				# Returns the fully constructed resource object (with ID if available)
				resource_data = self._handle_write(payload, server_id, is_new=True, user_ctx=user_ctx)
				self._log_command(server_id, user_ctx, action, payload)
				self.info(f"User {user_ctx.get('username')} added resource: {payload.get('name')}")
				
				# Push to Ranking
				if self.ranking_queue and resource_data:
					self.ranking_queue.put({
						"action": "rank_resource",
						"resource": resource_data,
						"server_id": server_id
					})

			elif action == "update_resource":
				resource_data = self._handle_write(payload, server_id, is_new=False, user_ctx=user_ctx)
				self._log_command(server_id, user_ctx, action, payload)
				self.info(f"User {user_ctx.get('username')} updated resource ID: {payload.get('id')}")

				# Push to Ranking
				if self.ranking_queue and resource_data:
					self.ranking_queue.put({
						"action": "rank_resource",
						"resource": resource_data,
						"server_id": server_id
					})

			elif action == "retire_resource":
				self._retire_resource(payload, server_id)
				self._log_command(server_id, user_ctx, action, payload)
				self.info(f"User {user_ctx.get('username')} retired resource ID: {payload.get('id')}")
				# Trigger ranking update for retired resource too (to remove it from Current)
				# Payload usually just has ID, we might need to fetch it or pass minimal info.
				# For simple invalidation, we might need a different action or just rely on re-ranking next time.
				# Ideally, we fetch it first. For now, we skip auto-ranking on retire to keep it simple, 
				# OR we fetch the resource before retiring to pass it to ranking. 
				# Let's defer "retire" ranking updates for now or handle via explicit refresh.

			elif action == "set_user_role":
				self._set_user_role(user_ctx, payload, server_id)
				self._log_command(server_id, user_ctx, action, payload)

			elif action == "reload_cache":
				self._hydrate_permissions()
				self.info("Permissions reloaded.")
			
			elif action == "add_schematic":
				schematic_data = self._handle_add_schematic(payload, server_id, user_ctx)
				self._log_command(server_id, user_ctx, action, payload)
				self.info(f"User {user_ctx.get('username')} added schematic: {payload.get('name')}")
				
				# Push to Ranking Service
				if self.ranking_queue:
					self.ranking_queue.put({
						"action": "rank_schematic",
						"schematic": schematic_data,
						"server_id": server_id
					})
			
			elif action == "recalculate_rankings":
				# Forward to Ranking Service
				if self.ranking_queue:
					self.ranking_queue.put({
						"action": "recalculate_rankings",
						"server_id": server_id
					})
					self.info(f"User {user_ctx.get('username')} triggered full ranking recalculation for {server_id}")
				else:
					raise ValueError("Ranking queue unavailable.")

			else:
				raise ValueError(f"No handler for action: {action}")

		except (PermissionError, ValueError) as e:
			self.warning(f"Rejected {action}: {e}")
			response['status'] = 'error'
			response['error'] = str(e)
		except Exception as e:
			self.error(f"System Error on {action}: {e}\n{traceback.format_exc()}")
			response['status'] = 'error'
			response['error'] = "Internal Server Error"
		
		if self.reply_queue and correlation_id:
			self.reply_queue.put(response)
	
	def _log_command(self, server_id, user_ctx, command, details):
		try:
			sql = """
				INSERT INTO command_log (server_id, user_id, username, command, details)
				VALUES (%s, %s, %s, %s, %s)
			"""
			details_json = json.dumps(details)
			with DatabaseContext.cursor(commit=True) as cur:
				cur.execute(sql, (server_id, user_ctx.get('id'), user_ctx.get('username'), command, details_json))
		except Exception as e:
			self.error(f"Failed to write to command log: {e}")

	# ----------------------------------------------------------------------
	# COMMAND LOGIC
	# ----------------------------------------------------------------------
	def _handle_write(self, data, server_id, is_new, user_ctx=None):
		self._validate_resource(data, server_id)
		self._calculate_ratings(data, server_id)

		if is_new:
			name = data.get('name')
			if self._resource_exists(name, server_id):
				raise ValueError(f"Error: {name} already exists for {server_id}")
			
			if data.get('mark_types_inactive'):
				self._bulk_deactivate(data.get('class_tree'), server_id, user_ctx)
				
			new_id = self._insert_resource(data, server_id, user_ctx)
			data['id'] = new_id # Augment payload with new ID
		else:
			self._update_resource(data, user_ctx)
		
		# Return the augmented data for the ranking service
		# Ensure we include server_id and active status
		data['server_id'] = server_id
		# If update, we might not have is_active in payload, usually assumes True unless specified
		if 'is_active' not in data and is_new: data['is_active'] = True
		return data
	
	def _bulk_deactivate(self, class_tree, server_id, user_ctx):
		if not class_tree: return
		sql_find = "SELECT id, name FROM resource_log WHERE server_id = %s AND class_tree = %s AND is_active = TRUE"
		sql_update = "UPDATE resource_log SET is_active = FALSE, last_modified = NOW() WHERE id = %s"

		try:
			with DatabaseContext.cursor(commit=True) as cur:
				cur.execute(sql_find, (server_id, class_tree))
				targets = cur.fetchall()
				
				if not targets: return

				for row in targets:
					cur.execute(sql_update, (row['id'],))
					log_details = {
						"action": "auto_deactivate",
						"target_resource_id": row['id'],
						"target_resource_name": row['name']
					}
					self._log_command(server_id, user_ctx, "update_resource", log_details)

		except Exception as e:
			self.error(f"Failed to bulk deactivate resources for {class_tree}: {e}")

	def _resource_exists(self, name, server_id):
		if not name: return False
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT 1 FROM resource_log WHERE name = %s AND server_id = %s", (name, server_id))
			return cur.fetchone() is not None

	def _retire_resource(self, data, server_id):
		res_id = data.get('id')
		if not res_id: raise ValueError("Missing ID")
		sql_update = "UPDATE resource_log SET is_active = FALSE, last_modified = NOW() WHERE id = %s AND server_id = %s"
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql_update, (res_id, server_id))

	def _set_user_role(self, requester_ctx, payload, server_id):
		target_uid = payload.get('target_user_id')
		target_role = payload.get('role').upper()
		if target_role not in self.ROLE_HIERARCHY: raise ValueError(f"Invalid role")
		
		req_uid = requester_ctx.get('id')
		is_allowed, req_role_name = self._check_permission(requester_ctx, server_id, 0)
		
		sql = """
			INSERT INTO server_permissions (user_id, server_id, role, assigned_by)
			VALUES (%s, %s, %s, %s)
			ON CONFLICT (user_id, server_id) 
			DO UPDATE SET role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
		"""
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, (target_uid, server_id, target_role, req_uid))

	# ----------------------------------------------------------------------
	# STAT CALCULATIONS & VALIDATION
	# ----------------------------------------------------------------------
	def _get_rules(self, data, server_id):
		class_tree = data.get('class_tree') or data.get('type')
		if not class_tree: raise ValueError(f"Missing Resource Class Tree ID")
		
		valid_resources = self.cache.get_server_data(server_id).get('valid_resources', {})
		rules = valid_resources.get(class_tree)
		
		if not rules:
			# Fallback: Check if it's in full taxonomy but marked invalid?
			# For adding new resources, strict validation is usually desired.
			raise ValueError(f"Resource class '{class_tree}' is not valid for spawning on server {server_id}.")
		return rules

	def _validate_resource(self, data, server_id):
		rules = self._get_rules(data, server_id)
		stats_def = rules.get('stats', {})
		allowed_planets = rules.get('planets', [])
		self.info(f"allowed_planets: {allowed_planets}")
		name = data.get('name', '')
		if not name or len(name) > 100: raise ValueError("Invalid Name")
		if not re.match(r'^[a-zA-Z0-9\s\-\(\)\.]+$', name): raise ValueError("Invalid characters in Name.")

		# FORCE LOWERCASE ON NAME
		data['name'] = name.lower()

		if data.get('notes'):
			data['notes'] = re.sub(r'<[^>]*>', '', data.get('notes'))

		planet_input = data.get('planet')
		if planet_input:
			if isinstance(planet_input, list):
				clean_list = [str(p).lower() for p in planet_input]
				data['planet'] = clean_list 
				for p in clean_list:
					if p not in allowed_planets: raise ValueError(f"Planet '{p}' invalid.")
			else:
				planet_str = str(planet_input).lower()
				data['planet'] = planet_str 
				if planet_str not in allowed_planets: raise ValueError(f"Planet '{planet_str}' invalid.")

		for stat in self.STAT_COLS:
			val = data.get(stat)
			if val is None or val == "": continue
			try: val = int(val)
			except: raise ValueError(f"{stat} must be int")

			if stat not in stats_def:
				if val > 0: raise ValueError(f"{stat} not applicable.")
				continue

			mn, mx = stats_def[stat]['min'], stats_def[stat]['max']
			if mn is not None and mx is not None:
				if not (mn <= val <= mx):
					raise ValueError(f"{stat} {val} out of range {mn}-{mx}")

	def _calculate_ratings(self, data, server_id):
		rules = self._get_rules(data, server_id)
		stats_def = rules.get('stats', {})
		valid_ratings = []

		for stat in self.STAT_COLS:
			val = data.get(stat)
			if val is None or val == "" or str(val) == "0": continue
			
			val = int(val)
			stat_max = stats_def.get(stat, {}).get('max', 1000)
			rating = round(val / stat_max, 3) if stat_max and stat_max > 0 else 0.0
			
			data[f"{stat}_rating"] = rating
			valid_ratings.append(rating)

		if valid_ratings:
			data['res_weight_rating'] = round(sum(valid_ratings) / len(valid_ratings), 3)
		else:
			data['res_weight_rating'] = 0.0
	
	def _handle_add_schematic(self, data, server_id, user_ctx):
		# 1. Input Sanitization & Structuring
		name = data.get('name', '').strip()
		if not name: raise ValueError("Schematic Name is required.")

		# Formatting: lower case name, replace spaces with underscores for ID/Filename
		schematic_id = name.lower().replace(" ", "_")
		
		# Simple heuristic mapping based on XP Type
		xp_type = data.get('xpType', '')
		category = data.get('category', '')
		
		# Format slots
		formatted_slots = {}
		for slot in data.get('slots', []):
			formatted_slots[slot['name']] = {
				"slot_type": int(slot['type']),
				"ingredient": slot['ingredient'],
				"quantity": int(slot['quantity'])
			}

		# Format experiment weights
		formatted_weights = {}
		for cat in data.get('experimentWeights', []):
			weight_group = {}
			for w in cat['weights']:
				weight_group[w['stat']] = float(w['value'])
			formatted_weights[cat['category']] = weight_group

		json_obj = {
			"id": schematic_id,
			"custom_object_name": name, # Kept original casing for display
			"base_profession": "Unknown", # Modal didn't ask for profession either! I'll infer or leave blank.
			"category": category,
			"certification": data.get('certification', ''),
			"complexity": int(data.get('complexity', 0)),
			"experience_type": xp_type,
			"experience": int(data.get('baseXp', 0)),
			"assembly_skill": data.get('assemblySkill', ''),
			"experimentation_skill": data.get('experimentSkill', ''),
			"customization_skill": data.get('customizationSkill', ''),
			"slots": formatted_slots,
			"experiment_weights": formatted_weights,
			"rankings": {},
			"last_updated": int(time.time())
		}
		
		# 2. File Writing
		# Base path: SWGBuddy/assets/schematics/<server_id>/<category>/<id>.json
		# __file__ is inside services/. Go up two levels to SWGBuddy root.
		root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
		target_dir = os.path.join(root_dir, 'assets', 'schematics', server_id, category.lower().replace(" ", "_"))
		os.makedirs(target_dir, exist_ok=True)
		
		file_path = os.path.join(target_dir, f"{schematic_id}.json")
		
		# Prevent overwriting core files? For now, we allow it (User is Admin).
		with open(file_path, 'w', encoding='utf-8') as f:
			json.dump(json_obj, f, indent=4)
			
		# 3. Update CacheManager
		# We need to manually inject this into the Shared Dictionary so other processes see it immediately
		# without a full reload.
		if self.cache and self.cache._shared_data:
			server_data = self.cache.get_server_data(server_id)
			if server_data:
				# Update Maps
				# Note: modifying nested objects in Manager.dict requires re-assignment!
				
				# 1. Map
				s_map = server_data.get('schematic_map', {}).copy()
				# Inject file path so ranking service can find it later if it reloads
				json_obj['file_path'] = file_path 
				s_map[schematic_id] = json_obj
				server_data['schematic_map'] = s_map
				
				# 2. Index
				s_idx = list(server_data.get('schematic_index', []))
				# Remove existing if update
				s_idx = [x for x in s_idx if x['id'] != schematic_id]
				s_idx.append({
					'id': schematic_id,
					'name': name,
					'profession': json_obj['base_profession'],
					'category': category.lower().replace(" ", "_")
				})
				# Sort index by name
				s_idx.sort(key=lambda x: x['name'])
				server_data['schematic_index'] = s_idx
				
				# Commit back to shared memory
				self.cache._shared_data[server_id] = server_data

		return json_obj

	# ----------------------------------------------------------------------
	# DB UTILS
	# ----------------------------------------------------------------------
	def _insert_resource(self, data, server_id, user_ctx):
		class_tree = data.get('class_tree')
		reporter_id = user_ctx.get('id') if user_ctx else None
		
		planet_val = data.get('planet')
		planet_arr = [planet_val] if isinstance(planet_val, str) else planet_val

		cols = ["server_id", "class_tree", "name", "planet", "res_weight_rating", "notes", "reporter_id", "waypoints"]
		vals = [
			server_id, class_tree, data['name'], planet_arr, 
			data.get('res_weight_rating', 0.0), data.get('notes', ''), reporter_id,
			data.get('waypoints', None)
		]

		for stat in self.STAT_COLS:
			if data.get(stat):
				cols.append(stat)
				vals.append(data[stat])
			if data.get(f"{stat}_rating") is not None:
				cols.append(f"{stat}_rating")
				vals.append(data[f"{stat}_rating"])

		placeholders = ",".join(["%s"] * len(vals))
		sql = f"INSERT INTO resource_log ({','.join(cols)}) VALUES ({placeholders}) RETURNING id"
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))
			row = cur.fetchone()
			return row['id']

	def _update_resource(self, data, user_ctx):
		res_id = data.get('id')
		updater_id = user_ctx.get('id') if user_ctx else None
		
		set_clauses = ["last_modified = NOW()", "res_weight_rating = %s", "last_updated_by = %s"]
		vals = [data.get('res_weight_rating', 0.0), updater_id]
		
		for stat in self.STAT_COLS:
			if stat in data:
				set_clauses.append(f"{stat} = %s")
				vals.append(data[stat])
			if f"{stat}_rating" in data:
				set_clauses.append(f"{stat}_rating = %s")
				vals.append(data[f"{stat}_rating"])

		for field in ['notes', 'is_active']:
			if field in data:
				set_clauses.append(f"{field} = %s")
				vals.append(data[field])

		if 'planet' in data:
			planet_val = data['planet']
			if isinstance(planet_val, list):
				set_clauses.append("planet = %s")
				vals.append(planet_val) 
			elif planet_val:
				set_clauses.append("planet = CASE WHEN %s = ANY(COALESCE(planet, ARRAY[]::text[])) THEN array_remove(planet, %s) ELSE array_append(COALESCE(planet, ARRAY[]::text[]), %s) END")
				vals.extend([planet_val, planet_val, planet_val])
		
		if 'waypoints' in data:
			set_clauses.append("waypoints = %s")
			vals.append(data['waypoints'])

		vals.append(res_id)
		sql = f"UPDATE resource_log SET {', '.join(set_clauses)} WHERE id = %s"
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))

	# ... (check_permission, sync_user unchanged) ...
	def _check_permission(self, user_ctx, server_id, required_power):
		if not user_ctx or not user_ctx.get('id'): return False, 'GUEST'
		uid = user_ctx.get('id')
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			u = cur.fetchone()
			if u and u['is_superadmin']: return True, 'SUPERADMIN'
			cur.execute("SELECT role FROM server_permissions WHERE user_id = %s AND server_id = %s", (uid, server_id))
			p = cur.fetchone()
		role = p['role'] if p else 'GUEST'
		return self.ROLE_HIERARCHY.get(role, 0) >= required_power, role

	def _sync_user(self, data):
		uid, username, avatar = data.get('id'), data.get('username'), data.get('avatar')
		sql_user = """
			INSERT INTO users (discord_id, username, avatar_url, last_login) VALUES (%s, %s, %s, NOW())
			ON CONFLICT (discord_id) DO UPDATE SET username=EXCLUDED.username, avatar_url=EXCLUDED.avatar_url, last_login=NOW()
		"""
		sql_grant = "INSERT INTO server_permissions (user_id, server_id, role, assigned_by) VALUES (%s, %s, 'USER', %s) ON CONFLICT DO NOTHING"
		
		try:
			with DatabaseContext.cursor(commit=True) as cur:
				cur.execute(sql_user, (uid, username, avatar))
				cur.execute("SELECT id FROM game_servers")
				for srv in cur.fetchall():
					cur.execute(sql_grant, (uid, srv['id'], uid))
		except Exception as e:
			self.error(f"Sync user error: {e}")