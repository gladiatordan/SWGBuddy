"""
SWGBuddy ValidationService Module

The Gatekeeper. Handles all writes, permission checks, data integrity, and stat calculations.
"""
import sys
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

	# Maps JSON keys to DB Columns
	STAT_COLS = [
		"res_oq", "res_cd", "res_dr", "res_fl", "res_hr", 
		"res_ma", "res_pe", "res_sr", "res_ut", "res_cr"
	]

	def __init__(self, input_queue, log_queue, reply_queue, cache):
		super().__init__(log_queue)
		self.input_queue = input_queue
		self.reply_queue = reply_queue
		self.cache = cache
		self.running = True
		
		# Caches
		self.valid_resources = {} # Will be populated by flattening the tree
	
	def _flatten_taxonomy(self, nodes):
		"""Recursively walks the tree to build the label -> config map."""
		for node in nodes:
			if node.get('is_valid'):
				self.valid_resources[node['label']] = {
					"id": node['id'],
					"stats": node.get('stats', {}),
					"planets": node.get('planets', [])
				}
			
			if node.get('children'):
				self._flatten_taxonomy(node['children'])

	def run(self):
		DatabaseContext.initialize()
		self.info("Initializing Validation Service...")
		
		# 1. Load Single Taxonomy File
		try:
			json_path = os.path.join(os.getcwd(), "assets", "resource_taxonomy.json")
			with open(json_path, 'r') as f:
				tree_data = json.load(f)
			
			# Flatten tree into self.valid_resources map
			self._flatten_taxonomy(tree_data)
			self.info(f"Loaded taxonomy. Valid types: {len(self.valid_resources)}")
			
		except Exception as e:
			self.critical(f"FATAL: Failed to load resource_taxonomy.json: {e}")
			return

		# 2. Hydrate DB Caches
		try:
			self._hydrate_permissions()
		except Exception as e:
			self.critical(f"FATAL: Failed to hydrate DB maps: {e}")
			return

		self.info("Validation Service Ready.")

		# 3. Main Loop
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
		"""Loads command permissions from the database."""
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT command, min_role_level FROM command_permissions")
			rows = cur.fetchall()
		self.command_permissions = {r['command']: r['min_role_level'] for r in rows}
		self.info(f"Hydrated Permissions for {len(self.command_permissions)} commands.")

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
			
			if action == 'sync_user':
				required_power = 0

			if required_power > 0:
				is_allowed, user_role = self._check_permission(user_ctx, server_id, required_power)
				if not is_allowed:
					raise PermissionError(f"Insufficient Permissions. Your Role: {user_role}, Required Level: {required_power}")

			if action == "sync_user":
				self._sync_user(payload)
				# self._log_command(server_id, user_ctx, action, payload)

			elif action == "add_resource":
				self._handle_write(payload, server_id, is_new=True, user_ctx=user_ctx)
				self._log_command(server_id, user_ctx, action, payload) # <--- Log
				self.info(f"User {user_ctx.get('username')} added resource: {payload.get('name')}")

			elif action == "update_resource":
				self._handle_write(payload, server_id, is_new=False, user_ctx=user_ctx)
				self._log_command(server_id, user_ctx, action, payload) # <--- Log
				self.info(f"User {user_ctx.get('username')} updated resource ID: {payload.get('id')}")

			elif action == "retire_resource":
				self._retire_resource(payload, server_id)
				self._log_command(server_id, user_ctx, action, payload) # <--- Log
				self.info(f"User {user_ctx.get('username')} retired resource ID: {payload.get('id')}")

			elif action == "set_user_role":
				self._set_user_role(user_ctx, payload, server_id)
				self._log_command(server_id, user_ctx, action, payload) # <--- Log
				self.info(f"Role change: {payload.get('target_user_id')} -> {payload.get('role')} on {server_id}")
			
			elif action == "reload_cache":
				self._reload_cache()
				self.info(f"Admin {user_ctx.get('username')} triggered cache reload.")

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
		"""Inserts a record into the command_log."""
		try:
			sql = """
				INSERT INTO command_log (server_id, user_id, username, command, details)
				VALUES (%s, %s, %s, %s, %s)
			"""
			
			# Use json.dumps for the JSONB column
			# Filter sensitive data from details if necessary here
			details_json = json.dumps(details)
			
			with DatabaseContext.cursor(commit=True) as cur:
				cur.execute(sql, (
					server_id, 
					user_ctx.get('id'), 
					user_ctx.get('username'), 
					command, 
					details_json
				))
		except Exception as e:
			self.error(f"Failed to write to command log: {e}")

	def _reload_cache(self):
		"""Re-reads the JSON taxonomy from disk."""
		try:
			json_path = os.path.join(os.getcwd(), "assets", "resource_taxonomy.json")
			with open(json_path, 'r') as f:
				tree_data = json.load(f)
			
			self.valid_resources = {}
			self._flatten_taxonomy(tree_data)
			self._hydrate_permissions()
			
			self.info(f"Cache Reloaded. Valid types: {len(self.valid_resources)}")
		except Exception as e:
			self.error(f"Failed to reload cache: {e}")
			raise e

	# ----------------------------------------------------------------------
	# COMMAND LOGIC
	# ----------------------------------------------------------------------
	def _handle_write(self, data, server_id, is_new, user_ctx=None):
		"""Unified Add/Edit logic with calculation and uniqueness check."""
		
		self._validate_resource(data)
		self._calculate_ratings(data)

		if is_new:
			name = data.get('name')
			if self._resource_exists(name, server_id):
				raise ValueError(f"Error: {name} already exists for {server_id}")
			
			# Check for Auto-Deactivate Flag
			if data.get('mark_types_inactive'):
				self._bulk_deactivate(data.get('type'), server_id, user_ctx)
				
			self._insert_resource(data, server_id, user_ctx)
		else:
			self._update_resource(data, user_ctx)
	
	def _bulk_deactivate(self, label, server_id, user_ctx):
		"""
		Marks all active resources of a specific type as inactive.
		Logs each deactivation individually.
		"""
		if not label: return

		rules = self.valid_resources.get(label, {})
		res_class_id = rules.get('id')
		if not res_class_id: return

		# 1. Identify targets
		sql_find = """
			SELECT id, name FROM resource_spawns 
			WHERE server_id = %s AND resource_class_id = %s AND is_active = TRUE
		"""
		
		# 2. Update targets
		sql_update = """
			UPDATE resource_spawns 
			SET is_active = FALSE, last_modified = NOW() 
			WHERE id = %s
		"""

		try:
			with DatabaseContext.cursor(commit=True) as cur:
				cur.execute(sql_find, (server_id, res_class_id))
				targets = cur.fetchall()
				
				if not targets:
					self.info(f"Auto-Deactivate: No active '{label}' resources found to update.")
					return

				for row in targets:
					# Update
					cur.execute(sql_update, (row['id'],))
					
					# Log
					log_details = {
						"action": "auto_deactivate",
						"reason": "New resource added with 'Mark Inactive' checked",
						"target_resource_id": row['id'],
						"target_resource_name": row['name']
					}
					self._log_command(server_id, user_ctx, "update_resource", log_details)
					self.info(f"Auto-Deactivated resource '{row['name']}' (ID: {row['id']})")

		except Exception as e:
			self.error(f"Failed to bulk deactivate resources for {label}: {e}")
			# We do NOT raise here, as we want the new insert to proceed even if cleanup fails partialy

	def _resource_exists(self, name, server_id):
		if not name: return False
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT 1 FROM resource_spawns WHERE name = %s AND server_id = %s", (name, server_id))
			return cur.fetchone() is not None

	def _retire_resource(self, data, server_id):
		res_id = data.get('id')
		if not res_id: 
			raise ValueError("Missing ID for retire command")

		sql_move = """
			INSERT INTO retired_resources 
			SELECT * FROM resource_spawns 
			WHERE id = %s AND server_id = %s
		"""
		sql_delete = "DELETE FROM resource_spawns WHERE id = %s AND server_id = %s"

		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql_move, (res_id, server_id))
			if cur.rowcount == 0:
				raise ValueError("Resource not found or already retired.")
			cur.execute(sql_delete, (res_id, server_id))

	def _set_user_role(self, requester_ctx, payload, server_id):
		target_uid = payload.get('target_user_id')
		target_role = payload.get('role').upper()
		
		if target_role not in self.ROLE_HIERARCHY:
			raise ValueError(f"Invalid role: {target_role}")

		req_uid = requester_ctx.get('id')
		is_allowed, req_role_name = self._check_permission(requester_ctx, server_id, 0)
		
		req_power = self.ROLE_HIERARCHY.get(req_role_name, 0)
		target_power = self.ROLE_HIERARCHY.get(target_role, 0)

		if req_role_name == 'SUPERADMIN':
			pass 
		elif req_role_name == 'ADMIN':
			if target_power >= 3: 
				raise PermissionError("Admins cannot promote users to Admin or SuperAdmin.")
		elif req_role_name == 'EDITOR':
			if target_power >= 2:
				raise PermissionError("Editors cannot promote users to Editor, Admin, or SuperAdmin.")
		else:
			raise PermissionError("Your role cannot assign permissions.")

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
	def _get_rules(self, data):
		label = data.get('type') 
		if not label:
			raise ValueError(f"Missing Resource Type/Label")
		
		rules = self.valid_resources.get(label)
		if not rules:
			raise ValueError(f"Resource type '{label}' is not valid for spawning.")
		return rules

	def _validate_resource(self, data):
		rules = self._get_rules(data)
		stats_def = rules.get('stats', {})
		allowed_planets = rules.get('planets', [])

		# HARDENING 1: Name Validation (Regex: Alphanumeric, spaces, parens, hyphens)
		name = data.get('name', '')
		if not name:
			raise ValueError("Resource name is required.")
		if not re.match(r'^[a-zA-Z0-9\s\-\(\)\.]+$', name):
			raise ValueError("Invalid characters in Resource Name.")
		if len(name) > 100:
			raise ValueError("Name too long.")

		# HARDENING 2: Sanitize Notes (Strip HTML tags)
		notes = data.get('notes', '')
		if notes:
			# Simple tag stripping since we don't have bleach
			clean_notes = re.sub(r'<[^>]*>', '', notes) 
			data['notes'] = clean_notes

		# Planet Validation
		planet_input = data.get('planet')
		if planet_input:
			if isinstance(planet_input, list):
				clean_list = [str(p).capitalize() for p in planet_input]
				data['planet'] = clean_list 
				for p in clean_list:
					if p not in allowed_planets:
						raise ValueError(f"Planet '{p}' is not valid for this resource type.")
			else:
				planet_str = str(planet_input).capitalize()
				data['planet'] = planet_str 
				if planet_str not in allowed_planets:
					raise ValueError(f"Planet '{planet_str}' is not valid for this resource type.")

		# Stat Validation (Unchanged)
		for stat in self.STAT_COLS:
			val = data.get(stat)
			if val is None or val == "": continue
			try:
				val = int(val)
			except: 
				raise ValueError(f"{stat} must be an integer")

			if stat not in stats_def:
				if val > 0: raise ValueError(f"{stat} is not applicable for this resource.")
				continue

			mn = stats_def[stat]['min']
			mx = stats_def[stat]['max']
			if not (mn <= val <= mx):
				raise ValueError(f"{stat} value {val} is out of range ({mn}-{mx}).")
		
		waypoints_str = data.get('waypoints')
		if waypoints_str:
			# Split by semicolon
			parts = [p for p in waypoints_str.split(';') if p.strip()]
			if len(parts) > 10:
				raise ValueError("Maximum 10 waypoints allowed.")

			for part in parts:
				# Format Check: /waypoint <x> <y> <name>
				# Regex checks for integer range implicitly by structure, but logic checks bounds explicitly
				match = re.match(r'^/waypoint\s+(-?\d+)\s+(-?\d+)\s+(.+)$', part.strip())
				if not match:
					raise ValueError(f"Invalid waypoint format: {part}")
				
				x, y, name = int(match.group(1)), int(match.group(2)), match.group(3)
				
				if not (-15000 <= x <= 15000):
					raise ValueError(f"Waypoint X must be between -15000 and 15000: {x}")
				if not (-15000 <= y <= 15000):
					raise ValueError(f"Waypoint Y must be between -15000 and 15000: {y}")
				if len(name) > 30:
					raise ValueError(f"Waypoint name too long (max 30 chars): {name}")

	def _calculate_ratings(self, data):
		rules = self._get_rules(data)
		stats_def = rules.get('stats', {})
		valid_ratings = []

		for stat in self.STAT_COLS:
			val = data.get(stat)
			if val is None or val == "" or str(val) == "0": continue
				
			val = int(val)
			stat_max = stats_def[stat]['max']
			rating = round(val / stat_max, 3) if stat_max > 0 else 0.0
			
			data[f"{stat}_rating"] = rating
			valid_ratings.append(rating)

		if valid_ratings:
			avg = sum(valid_ratings) / len(valid_ratings)
			data['res_weight_rating'] = round(avg, 3)
		else:
			data['res_weight_rating'] = 0.0

	# ----------------------------------------------------------------------
	# DB UTILS
	# ----------------------------------------------------------------------
	def _insert_resource(self, data, server_id, user_ctx):
		label = data.get('type')
		rules = self.valid_resources.get(label, {})
		res_class_id = rules.get('id')
		allowed_planets = rules.get('planets')
		# Get Reporter ID
		reporter_id = user_ctx.get('id') if user_ctx else None
		# FIX: Wrap planet string in a list so psycopg2 adapts it to SQL ARRAY
		planet_val = data.get('planet')

		if len(allowed_planets) == 1:
			# This resource type has only 1 available potential planet, just add it automatically and ignore whatever they tried to add
			planet_arr = allowed_planets
		else:
			# Push whatever planets were assigned from the frontend
			planet_arr = [planet_val] if planet_val else None

		cols = ["server_id", "resource_class_id", "name", "planet", "res_weight_rating", "notes", "reporter_id", "waypoints"]
		vals = [
			server_id, res_class_id, data['name'], planet_arr, 
			data.get('res_weight_rating', 0.0), data.get('notes', ''), reporter_id,
			data.get('waypoint', None)
		]

		for stat in self.STAT_COLS:
			if data.get(stat):
				cols.append(stat)
				vals.append(data[stat])
			if data.get(f"{stat}_rating") is not None:
				cols.append(f"{stat}_rating")
				vals.append(data[f"{stat}_rating"])

		placeholders = ",".join(["%s"] * len(vals))
		sql = f"INSERT INTO resource_spawns ({','.join(cols)}) VALUES ({placeholders})"
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))

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

		# FIX: Smart Planet Logic
		if 'planet' in data:
			planet_val = data['planet']
			
			if isinstance(planet_val, list):
				# MODE 1: List provided? Perform FULL REPLACE (Overwrite)
				# This handles 'toggleStatus' sending the full current list
				set_clauses.append("planet = %s")
				vals.append(planet_val) 
			elif planet_val:
				# MODE 2: String provided? Perform TOGGLE (Add/Remove)
				# This handles 'togglePlanet' sending a single name
				set_clauses.append("planet = CASE WHEN %s = ANY(COALESCE(planet, ARRAY[]::text[])) THEN array_remove(planet, %s) ELSE array_append(COALESCE(planet, ARRAY[]::text[]), %s) END")
				vals.extend([planet_val, planet_val, planet_val])
		
		if 'waypoints' in data:
			set_clauses.append("waypoints = %s")
			vals.append(data['waypoints'])

		vals.append(res_id)
		sql = f"UPDATE resource_spawns SET {', '.join(set_clauses)} WHERE id = %s"
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))

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
		user_power = self.ROLE_HIERARCHY.get(role, 0)
		
		return user_power >= required_power, role

	def _sync_user(self, data):
		uid = data.get('id')
		username = data.get('username')
		avatar = data.get('avatar')

		sql_user = """
			INSERT INTO users (discord_id, username, avatar_url, last_login) 
			VALUES (%s, %s, %s, NOW())
			ON CONFLICT (discord_id) 
			DO UPDATE SET username=EXCLUDED.username, avatar_url=EXCLUDED.avatar_url, last_login=NOW()
		"""
		sql_get_servers = "SELECT id FROM game_servers"
		sql_grant_perm = """
			INSERT INTO server_permissions (user_id, server_id, role, assigned_by)
			VALUES (%s, %s, 'USER', %s)
			ON CONFLICT (user_id, server_id) DO NOTHING
		"""

		try:
			with DatabaseContext.cursor(commit=True) as cur:
				cur.execute(sql_user, (uid, username, avatar))
				cur.execute(sql_get_servers)
				servers = cur.fetchall()
				for server in servers:
					sid = server['id']
					cur.execute(sql_grant_perm, (uid, sid, uid))
					
			self.info(f"Synced user {username} ({uid}) and checked permissions for {len(servers)} servers.")

		except Exception as e:
			self.error(f"Error syncing user {username}: {e}")
			raise e