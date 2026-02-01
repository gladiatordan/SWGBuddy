import os
import re
import io
import uuid
import json
import threading
import time
import requests
import secrets
import urllib.parse
from queue import Queue, Empty
from flask import Flask, jsonify, request, render_template, redirect, url_for, session, current_app, abort
from flask_cors import CORS
from core.database import DatabaseContext

from PIL import Image
import pytesseract

app = Flask(__name__)
CORS(app)

# SECURITY CONFIGURATION
# --------------------------------------------------------------------------
# 1. Secret Key: Must be random in production.
app.secret_key = os.getenv("FLASK_SECRET_KEY")

# 2. Cookie Security:
# 'Lax' prevents CSRF for most top-level navigations while preserving login.
app.config.update(
	SESSION_COOKIE_HTTPONLY=True,
	SESSION_COOKIE_SAMESITE='Lax',
	# Require HTTPS (Browsers may block cookies on HTTP if this is True)
	SESSION_COOKIE_SECURE=os.getenv("APP_ENV") != "development",
	PERMANENT_SESSION_LIFETIME=86400 * 7 # 7 Days
)

# --------------------------------------------------------------------------
# SECURITY MIDDLEWARE
# --------------------------------------------------------------------------
@app.after_request
def set_security_headers(response):
	"""Applies security headers to every response."""
	response.headers['X-Content-Type-Options'] = 'nosniff'
	response.headers['X-Frame-Options'] = 'SAMEORIGIN'
	response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
	return response

@app.before_request
def csrf_protect():
	"""
	CSRF Protection:
	For state-changing requests (POST), verify the custom header 'X-Requested-With'.
	Browsers do not allow cross-origin sites to set this header, ensuring the request
	came from our own frontend app.
	"""
	if request.method == "POST":
		if not request.headers.get('X-Requested-With') == 'XMLHttpRequest':
			# Log specific warning for debugging
			print(f"CSRF Blocked: {request.path} missing X-Requested-With header")
			abort(403, description="CSRF Validation Failed")

# ... (Rest of existing router logic and endpoints) ...
# (Keep response_router, start_response_router, send_command, and all routes unchanged below)

response_futures = {} 

def start_response_router(reply_queue):
	t = threading.Thread(target=_router_loop, args=(reply_queue,), daemon=True)
	t.start()

def _router_loop(reply_queue):
	while True:
		try:
			msg = reply_queue.get()
			cid = msg.get('id')
			if cid and cid in response_futures:
				response_futures[cid].put(msg)
		except Exception as e:
			print(f"Router Error: {e}")
			time.sleep(1)

def send_command(action, payload, server_id='cuemu', timeout=10):
	if 'VAL_QUEUE' not in current_app.config:
		return {"status": "error", "error": "Backend Unavailable"}

	cid = str(uuid.uuid4())
	future = Queue()
	response_futures[cid] = future
	
	user_context = {
		"id": session.get('discord_id'),
		"username": session.get('username'),
		"avatar": session.get('avatar')
	}
	
	packet = {
		"id": cid,
		"action": action,
		"payload": payload,
		"server_id": server_id,
		"user_context": user_context
	}
	
	try:
		current_app.config['VAL_QUEUE'].put(packet)
		response = future.get(timeout=timeout)
		return response
	except Empty:
		return {"status": "error", "error": "Request Timed Out"}
	except Exception as e:
		return {"status": "error", "error": str(e)}
	finally:
		response_futures.pop(cid, None)

# @app.route('/')
# def index():
# 	# 1. Parse Query Params
# 	page = request.args.get('page', 'resources')
# 	server_id = request.args.get('server', 'cuemu') # Default to cuemu if not specified

# 	# 2. Define Default Metadata
# 	og_title = "SWGBuddy Resource Tracker"
# 	og_desc = "Track, share, and find Star Wars Galaxies resources."

# 	# 2. Router Logic for Metadata
# 	if page == 'resources':
# 		resource_name = request.args.get('resource')
# 		if resource_name:
# 			try:
# 				with DatabaseContext.cursor() as cur:
# 					# Query resource details for the embed
# 					sql = """
# 						SELECT rl.name, rl.res_weight_rating, rc.label as type_label, gs.name as server_name
# 						FROM resource_log rl
# 						JOIN resource_class rc ON rl.class_tree = rc.class_tree
# 						JOIN game_servers gs ON rl.server_id = gs.id
# 						WHERE rl.server_id = %s AND LOWER(rl.name) = LOWER(%s)
# 						LIMIT 1
# 					"""
# 					cur.execute(sql, (server_id, resource_name))
# 					row = cur.fetchone()
					
# 					if row:
# 						# Format: "Calypsa (Corn) - 98.5%"
# 						pct = int(row['res_weight_rating'] * 1000) / 10
# 						og_title = f"{row['name']} ({row['type_label']}) - {pct}%"
# 						og_desc = f"Server: {row['server_name']} | Type: {row['type_label']}"
# 			except Exception as e:
# 				print(f"Metadata injection error: {e}")
			
# 	elif page == 'schematics':
# 		schematic_id = request.args.get('schematic_id') # Example param
# 		if schematic_id:
# 			# Placeholder for Schematic Logic
# 			# row = query_schematic(schematic_id)
# 			# og_title = f"Schematic: {row['name']}"
# 			og_title = "SWG Schematic"
# 			og_desc = "Schematic details coming soon."
	

# 	# 4. Inject into HTML
# 	# We manually read and replace to avoid React/Jinja conflicts
# 	try:
# 		# Determine path to templates/index.html
# 		template_folder = app.template_folder or 'templates'
# 		template_path = os.path.join(template_folder, 'index.html')

# 		# If running in dev without build, this might fail, fallback to render_template
# 		if not os.path.exists(template_path):
# 				return render_template("index.html")

# 		with open(template_path, 'r', encoding='utf-8') as f:
# 			html_content = f.read()

# 		# Replace Placeholders
# 		html_content = html_content.replace('__OG_TITLE__', str(og_title))
# 		html_content = html_content.replace('__OG_DESCRIPTION__', str(og_desc))

# 		return html_content

# 	except Exception as e:
# 		print(f"Error serving index with injection: {e}")
# 		return render_template("index.html")

# --- AUTHENTICATION ---

@app.route('/login')
def login():
	state = secrets.token_urlsafe(16)
	session['oauth_state'] = state
	
	# Discord OAuth2
	DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
	DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://swgbuddy.com/callback")
	DISCORD_API_URL = "https://discord.com/api"
	
	scope = "identify"
	params = {
		'client_id': DISCORD_CLIENT_ID,
		'redirect_uri': DISCORD_REDIRECT_URI,
		'response_type': 'code',
		'scope': scope,
		'state': state
	}
	
	url = f"{DISCORD_API_URL}/oauth2/authorize?{urllib.parse.urlencode(params)}"
	return redirect(url)

@app.route('/callback')
def callback():
	received_state = request.args.get('state')
	stored_state = session.pop('oauth_state', None)
	
	if not received_state or received_state != stored_state:
		return "Error: State mismatch. Please try logging in again.", 400

	code = request.args.get('code')
	if not code: return "Error: No code provided", 400

	DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
	DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
	DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://swgbuddy.com/callback")
	DISCORD_API_URL = "https://discord.com/api"

	data = {
		'client_id': DISCORD_CLIENT_ID,
		'client_secret': DISCORD_CLIENT_SECRET,
		'grant_type': 'authorization_code',
		'code': code,
		'redirect_uri': DISCORD_REDIRECT_URI
	}
	
	try:
		token_resp = requests.post(f"{DISCORD_API_URL}/oauth2/token", data=data)
		token_resp.raise_for_status()
		access_token = token_resp.json()['access_token']

		user_resp = requests.get(f"{DISCORD_API_URL}/users/@me", headers={"Authorization": f"Bearer {access_token}"})
		user_resp.raise_for_status()
		user_data = user_resp.json()

		send_command("sync_user", user_data)
		
		session.permanent = True
		session['discord_id'] = user_data['id']
		session['username'] = user_data['username']
		session['avatar'] = user_data['avatar']

		return redirect(url_for('index'))

	except Exception as e:
		print(f"Login Error: {e}")
		return f"Login Failed: {str(e)}", 500

@app.route('/logout')
def logout():
	session.clear()
	return redirect(url_for('index'))

@app.route('/api/me')
def get_current_user():
	if 'discord_id' not in session:
		return jsonify({"authenticated": False})
	
	uid = session['discord_id']
	is_super = False
	perms = {}
	
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			row = cur.fetchone()
			if row: is_super = row['is_superadmin']
			
			cur.execute("SELECT server_id, role FROM server_permissions WHERE user_id = %s", (uid,))
			rows = cur.fetchall()
			perms = {r['server_id']: r['role'] for r in rows}
	except Exception as e:
		print(f"DB Error in /api/me: {e}")

	session['server_perms'] = perms
	session['is_superadmin'] = is_super

	return jsonify({
		"authenticated": True,
		"id": uid,
		"username": session['username'],
		"avatar": session['avatar'],
		"is_superadmin": is_super,
		"server_perms": perms
	})

# --- ADMIN ENDPOINTS ---

ROLE_HIERARCHY = {
	'SUPERADMIN': 100,
	'ADMIN': 3,
	'EDITOR': 2,
	'USER': 1,
	'GUEST': 0
}

@app.route('/api/admin/users', methods=['GET'])
def get_managed_users():
	if 'discord_id' not in session: 
		return jsonify({"error": "Unauthorized"}), 401

	uid = session['discord_id']
	server_id = request.args.get('server', 'cuemu')
	
	req_level = 0
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			user_row = cur.fetchone()
			
			if user_row and user_row['is_superadmin']:
				req_level = ROLE_HIERARCHY['SUPERADMIN']
			else:
				cur.execute(
					"SELECT role FROM server_permissions WHERE user_id = %s AND server_id = %s", 
					(uid, server_id)
				)
				perm_row = cur.fetchone()
				role_str = perm_row['role'] if perm_row else 'GUEST'
				req_level = ROLE_HIERARCHY.get(role_str, 0)

		if req_level < ROLE_HIERARCHY['EDITOR']:
			return jsonify({"error": "Forbidden"}), 403

		sql = """
			SELECT u.discord_id, u.username, u.avatar_url, sp.role
			FROM server_permissions sp
			JOIN users u ON sp.user_id = u.discord_id
			WHERE sp.server_id = %s
		"""
		
		with DatabaseContext.cursor() as cur:
			cur.execute(sql, (server_id,))
			all_users = cur.fetchall()
			
		manageable_users = []
		for u in all_users:
			target_role = u['role']
			target_level = ROLE_HIERARCHY.get(target_role, 0)
			
			if target_level < req_level:
				manageable_users.append({
					"id": u['discord_id'],
					"username": u['username'],
					"avatar": u['avatar_url'],
					"role": target_role
				})
				
		return jsonify({"users": manageable_users})

	except Exception as e:
		print(f"Error in get_managed_users: {e}")
		return jsonify({"error": "Internal Server Error"}), 500

@app.route('/api/admin/command-log', methods=['GET'])
def get_command_log():
	if 'discord_id' not in session: 
		return jsonify({"error": "Unauthorized"}), 401

	server_id = request.args.get('server', 'cuemu')
	page = int(request.args.get('page', 1))
	limit = int(request.args.get('limit', 25))
	search = request.args.get('search', '').strip()
	
	uid = session['discord_id']
	req_level = 0
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			user_row = cur.fetchone()
			if user_row and user_row['is_superadmin']:
				req_level = 100
			else:
				cur.execute("SELECT role FROM server_permissions WHERE user_id = %s AND server_id = %s", (uid, server_id))
				perm_row = cur.fetchone()
				req_level = ROLE_HIERARCHY.get(perm_row['role'], 0) if perm_row else 0
	except:
		return jsonify({"error": "DB Error"}), 500

	if req_level < 2: # Editor+
		return jsonify({"error": "Forbidden"}), 403
	
	offset = (page - 1) * limit
	
	base_sql = """
		SELECT cl.*, u.avatar_url, EXTRACT(EPOCH FROM cl.date_executed) as timestamp
		FROM command_log cl
		LEFT JOIN users u ON cl.user_id = u.discord_id
		WHERE cl.server_id = %s
	"""
	params = [server_id]
	
	if search:
		base_sql += """ AND (
			cl.username ILIKE %s OR 
			cl.command ILIKE %s OR 
			cl.details::text ILIKE %s
		)"""
		term = f"%{search}%"
		params.extend([term, term, term])
		
	count_sql = f"SELECT COUNT(*) as total FROM ({base_sql}) as sub"
	data_sql = base_sql + " ORDER BY cl.date_executed DESC LIMIT %s OFFSET %s"
	params_data = params + [limit, offset]
	
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute(count_sql, tuple(params))
			total = cur.fetchone()['total']
			
			cur.execute(data_sql, tuple(params_data))
			rows = cur.fetchall()
			
		return jsonify({
			"logs": rows,
			"total": total,
			"page": page,
			"pages": (total // limit) + (1 if total % limit > 0 else 0)
		})
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/api/admin/reload-cache', methods=['POST'])
def reload_cache():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	if not session.get('is_superadmin'): return jsonify({"error": "Forbidden"}), 403

	resp = send_command("reload_cache", {})
	if resp['status'] == 'success':
		return jsonify({"success": True, "message": "Cache reloaded."})
	return jsonify({"error": resp.get('error')}), 500

# --- DATA ENDPOINTS ---

@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
	if 'discord_id' not in session:
		return jsonify({"error": "Unauthorized", "resources": []}), 401

	server_id = request.args.get('server', 'cuemu')
	try:
		since = float(request.args.get('since', 0))
	except:
		since = 0
	
	# optional filter
	res_type = request.args.get('type')
	
	sql = """
		SELECT rl.*, 
			   rc.label as type, -- Get human readable label
			   u.username as reporter_name,
			   u2.username as updater_name,
			   EXTRACT(EPOCH FROM rl.date_reported) as date_reported_ts,
			   EXTRACT(EPOCH FROM rl.last_modified) as last_modified_ts
		FROM resource_log rl
		JOIN resource_class rc ON rl.class_tree = rc.class_tree
		LEFT JOIN users u ON rl.reporter_id = u.discord_id
		LEFT JOIN users u2 ON rl.last_updated_by = u2.discord_id
		WHERE rl.server_id = %s 
		AND (EXTRACT(EPOCH FROM rl.date_reported) > %s 
			 OR (rl.last_modified IS NOT NULL AND EXTRACT(EPOCH FROM rl.last_modified) > %s))
		ORDER BY rl.date_reported DESC
	"""

	if res_type:
		sql = sql.replace("ORDER BY", "AND rl.class_tree LIKE %s ORDER BY")
	
	try:
		with DatabaseContext.cursor() as cur:
			if res_type:
				cur.execute(sql, (server_id, since, since, f"{res_type}%"))
			else:
				cur.execute(sql, (server_id, since, since))
			rows = cur.fetchall()
		return jsonify({"resources": rows})
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/api/<server_id>/taxonomy', methods=['GET'])
def get_server_taxonomy(server_id):
	"""
	Fetches pre-computed taxonomy and validation rules from the Shared Cache.
	Replaces the old static file load.
	"""
	try:
		cache = current_app.config.get('CACHE')
		if not cache:
			return jsonify({"error": "Cache service unavailable"}), 503

		# CacheManager returns a dict with keys: 'taxonomy', 'valid_resources', 'filter_flatlist'
		data = cache.get_server_data(server_id)
		
		if not data:
			return jsonify({"error": f"No data found for server {server_id}"}), 404

		return jsonify({
			"taxonomy": data.get("taxonomy", {}),
			"valid_resources": data.get("valid_resources", {}),
			"filter_list": data.get("filter_flatlist", {})
		})
	except Exception as e:
		return jsonify({"error": f"Taxonomy error: {e}"}), 500

# --- WRITE OPERATIONS ---

@app.route('/api/add-resource', methods=['POST'])
def add_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json
	
	# Ensure frontend sends 'class_tree' now, not just 'type'
	if 'class_tree' not in data and 'type' in data:
		# Fallback if frontend sends 'type' as the tree ID
		data['class_tree'] = data['type']

	resp = send_command("add_resource", data, server_id=data.get('server_id', 'cuemu'))
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json

	# Ensure frontend sends 'class_tree' now, not just 'type'
	if 'class_tree' not in data and 'type' in data:
		# Fallback if frontend sends 'type' as the tree ID
		data['class_tree'] = data['type']

	resp = send_command("update_resource", data, server_id=data.get('server_id', 'cuemu'))
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/retire-resource', methods=['POST'])
def retire_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json

	# Ensure frontend sends 'class_tree' now, not just 'type'
	if 'class_tree' not in data and 'type' in data:
		# Fallback if frontend sends 'type' as the tree ID
		data['class_tree'] = data['type']


	resp = send_command("retire_resource", data, server_id=data.get('server_id', 'cuemu'))
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/set-role', methods=['POST'])
def set_role():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json
	resp = send_command("set_user_role", data, server_id=data.get('server_id', 'cuemu'))
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

# IMAGE SCANNING
@app.route('/api/scan-image', methods=['POST'])
def scan_image():
	if 'discord_id' not in session: 
		return jsonify({"error": "Unauthorized"}), 401
	
	if 'image' not in request.files:
		return jsonify({"error": "No image provided"}), 400

	if not Image:
		return jsonify({"error": "OCR libraries not installed"}), 500

	file = request.files['image']
	
	try:
		img = Image.open(file.stream).convert('RGB')
		raw_text = pytesseract.image_to_string(img, config='--psm 6')
		
		extracted = {
			"name": "",
			"class_tree": "", # OCR likely can't derive this, user must select
			"stats": {}
		}
		
		lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
		
		# Name Extraction Heuristic
		if len(lines) > 0: 
			for i in range(len(lines)):
				if "Resource Type:" in lines[i]:
					extracted['name'] = lines[i].split(": ")[1]

		# UPDATED STAT MAPPING: Legacy Text -> New Column Names
		stat_patterns = {
			'res_cold_resist': r'(Cold Resistance).*?(\d{1,4})',
			'res_conductivity': r'(Conductivity).*?(\d{1,4})',
			'res_decay_resist': r'(Decay Resistance).*?(\d{1,4})',
			'res_flavor': r'(Flavor).*?(\d{1,4})',
			'res_heat_resist': r'(Heat Resistance).*?(\d{1,4})',
			'res_malleability': r'(Malleability).*?(\d{1,4})',
			'res_potential_energy': r'(Potential Energy).*?(\d{1,4})',
			'res_quality': r'(Overall Quality).*?(\d{1,4})',
			'res_shock_resistance': r'(Shock Resistance).*?(\d{1,4})',
			'res_toughness': r'(Unit Toughness).*?(\d{1,4})',
			'entangle_resistance': r'(Entangle Resistance).*?(\d{1,4})'
		}
		
		for key, pattern in stat_patterns.items():
			match = re.search(pattern, raw_text, re.IGNORECASE)
			if match:
				val = int(match.group(2))
				if 1 <= val <= 1000:
					extracted['stats'][key] = val
		
		return jsonify({"success": True, "data": extracted})

	except Exception as e:
		print(f"OCR Error: {e}")
		return jsonify({"error": "Failed to process image."}), 500


# --- SCHEMATICS ENDPOINTS ---
@app.route('/api/schematics/index', methods=['GET'])
def get_schematic_index():
    server_id = request.args.get('server', 'cuemu')
    
    try:
        cache = current_app.config.get('CACHE')
        if not cache:
            return jsonify({"error": "Cache service unavailable"}), 503

        data = cache.get_server_data(server_id)
        if not data:
            return jsonify({"error": f"No data found for server {server_id}"}), 404
            
        # Return just the lightweight index
        return jsonify(data.get("schematic_index", []))
        
    except Exception as e:
        return jsonify({"error": f"Schematic index error: {e}"}), 500

@app.route('/api/schematics/<schematic_id>', methods=['GET'])
def get_schematic_details(schematic_id):
    server_id = request.args.get('server', 'cuemu')
    
    try:
        cache = current_app.config.get('CACHE')
        if not cache:
            return jsonify({"error": "Cache service unavailable"}), 503

        data = cache.get_server_data(server_id)
        schematic_map = data.get("schematic_map", {})
        
        schematic = schematic_map.get(schematic_id)
        
        if not schematic:
            return jsonify({"error": "Schematic not found"}), 404
            
        return jsonify(schematic)
        
    except Exception as e:
        return jsonify({"error": f"Schematic details error: {e}"}), 500

@app.route('/api/schematics/updates', methods=['POST'])
def check_schematic_updates():
    server_id = request.json.get('server', 'cuemu')
    ids = request.json.get('ids', [])
    
    try:
        cache = current_app.config.get('CACHE')
        if not cache:
            return jsonify({"error": "Cache service unavailable"}), 503

        data = cache.get_server_data(server_id)
        schematic_map = data.get("schematic_map", {})
        
        updates = {}
        for sch_id in ids:
            schematic = schematic_map.get(sch_id)
            if schematic:
                # Return timestamps to the frontend to compare against their local version
                # Defaults to 0 if the schematic hasn't been ranked/updated yet
                updates[sch_id] = schematic.get('last_updated', 0)
                
        return jsonify(updates)
        
    except Exception as e:
        return jsonify({"error": f"Update check error: {e}"}), 500

@app.route('/api/schematics/add', methods=['POST'])
def add_schematic():
    if 'discord_id' not in session: 
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    server_id = data.get('server_id', 'cuemu')

    # Send command to ValidationService
    resp = send_command("add_schematic", data, server_id=server_id)
    
    if resp['status'] == 'success':
        return jsonify({"success": True})
    
    return jsonify({"error": resp.get('error', 'Unknown error')}), 500

@app.route('/api/admin/recalc-rankings', methods=['POST'])
def recalc_rankings():
    if 'discord_id' not in session: 
        return jsonify({"error": "Unauthorized"}), 401
    
    # Strict Superadmin Check
    if not session.get('is_superadmin'): 
        return jsonify({"error": "Forbidden"}), 403

    data = request.json
    server_id = data.get('server_id', 'cuemu')

    # Send command to the backend processing queue
    # Action 'recalculate_rankings' must be handled by your core.py or backend worker
    resp = send_command("recalculate_rankings", {"server_id": server_id}, server_id=server_id)
    
    if resp['status'] == 'success':
        return jsonify({"success": True, "message": "Recalculation started."})
    
    return jsonify({"error": resp.get('error', 'Unknown error')}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    # 1. API Protection: Don't serve HTML for API 404s
    if path.startswith('api/'):
        return jsonify(error="Not Found"), 404

    # 2. Static File Serving
    # Check if the path exists in the static folder (e.g. assets/css/main.css)
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)

    # 3. Metadata Logic (SPA Injection)
    # We determining context based on PATH first, then query params (Legacy)
    og_title = "SWGBuddy Resource Tracker"
    og_desc = "Track, share, and find Star Wars Galaxies resources."
    
    # Check Path (Modern React Routing)
    is_resource_page = path == 'resources'
    is_schematic_page = path == 'schematics'
    
    # Check Legacy Query Params (Backwards Compatibility)
    if not is_resource_page and request.args.get('page') == 'resources':
        is_resource_page = True
    if not is_schematic_page and request.args.get('page') == 'schematics':
        is_schematic_page = True

    if is_resource_page:
        resource_name = request.args.get('resource')
        if resource_name:
            try:
                server_id = request.args.get('server', 'cuemu')
                with DatabaseContext.cursor() as cur:
                    sql = """
                        SELECT rl.name, rl.res_weight_rating, rc.label as type_label, gs.name as server_name
                        FROM resource_log rl
                        JOIN resource_class rc ON rl.class_tree = rc.class_tree
                        JOIN game_servers gs ON rl.server_id = gs.id
                        WHERE rl.server_id = %s AND LOWER(rl.name) = LOWER(%s)
                        LIMIT 1
                    """
                    cur.execute(sql, (server_id, resource_name))
                    row = cur.fetchone()
                    if row:
                        pct = int(row['res_weight_rating'] * 1000) / 10
                        og_title = f"{row['name']} ({row['type_label']}) - {pct}%"
                        og_desc = f"Server: {row['server_name']} | Type: {row['type_label']}"
            except Exception as e:
                print(f"Metadata injection error: {e}")

    elif is_schematic_page:
        # Placeholder for Schematic Metadata
        og_title = "SWG Schematics"
        og_desc = "Browse crafting schematics."

    # 4. Serve index.html with Injection
    try:
        # Always look in the template folder for the entry point
        template_folder = app.template_folder or 'templates'
        template_path = os.path.join(template_folder, 'index.html')

        # Fallback to render_template if direct file read fails
        if not os.path.exists(template_path):
            return render_template("index.html")

        with open(template_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        html_content = html_content.replace('__OG_TITLE__', str(og_title))
        html_content = html_content.replace('__OG_DESCRIPTION__', str(og_desc))

        return html_content

    except Exception as e:
        print(f"Error serving SPA: {e}")
        return render_template("index.html")

if __name__ == '__main__':
	app.run(debug=True, port=5000)