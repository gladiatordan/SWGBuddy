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
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret_key_change_me")

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

@app.route('/')
def index():
	return render_template("index.html")

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
	
	sql = """
		SELECT rs.*, 
			   rt.class_label as type, 
			   u.username as reporter_name,
			   EXTRACT(EPOCH FROM rs.date_reported) as date_reported_ts,
			   EXTRACT(EPOCH FROM rs.last_modified) as last_modified_ts
		FROM resource_spawns rs
		JOIN resource_taxonomy rt ON rs.resource_class_id = rt.id
		LEFT JOIN users u ON rs.reporter_id = u.discord_id
		WHERE rs.server_id = %s 
		AND (EXTRACT(EPOCH FROM rs.date_reported) > %s 
			 OR (rs.last_modified IS NOT NULL AND EXTRACT(EPOCH FROM rs.last_modified) > %s))
		ORDER BY rs.date_reported DESC
	"""
	
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute(sql, (server_id, since, since))
			rows = cur.fetchall()
		return jsonify({"resources": rows})
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/api/taxonomy', methods=['GET'])
def get_taxonomy():
	try:
		base_dir = os.path.dirname(os.path.abspath(__file__))
		path = os.path.join(base_dir, "assets", "resource_taxonomy.json")
		with open(path, 'r') as f:
			data = json.load(f)
		resp = jsonify(data)
		resp.headers['Cache-Control'] = 'public, max-age=86400'
		return resp
	except Exception as e:
		return jsonify({"error": f"Taxonomy unavailable: {e}"}), 500

# --- WRITE OPERATIONS ---

@app.route('/api/add-resource', methods=['POST'])
def add_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json
	resp = send_command("add_resource", data, server_id=data.get('server_id', 'cuemu'))
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json
	resp = send_command("update_resource", data, server_id=data.get('server_id', 'cuemu'))
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/retire-resource', methods=['POST'])
def retire_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	data = request.json
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

	file = request.files['image']
	
	try:
		# 1. Open and Sanitize Image (Strip metadata/exif)
		img = Image.open(file.stream)
		# Convert to RGB to handle alpha channels or palettes which might confuse simple OCR
		img = img.convert('RGB')
		
		# 2. Perform OCR
		# Custom config: assume single block of text (6), preserve structure
		raw_text = pytesseract.image_to_string(img, config='--psm 6')
		
		# 3. Parse Data (SWG Resource Window format)
		extracted = {
			"name": "",
			"type": "",
			"stats": {}
		}
		
		lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
		
		# Heuristic: Line 1 is usually Name, Line 2 is usually Type
		if len(lines) > 0: 
			for i in range(len(lines)):
				if "Resource Type:" in lines[i]:
					extracted['name'] = lines[i].split(": ")[1]

		# We don't set Type automatically from OCR as it often misreads complex names.
		# Instead, we rely on the user or fuzzy matching if you wanted to go deeper.
		
		# Regex for Stats (e.g., "OQ: 954" or "Overall Quality 954")
		# Matches standard abbreviations or full names roughly
		stat_patterns = {
			'res_cr': r'(Cold Resistance).*?(\d{1,4})',
			'res_cd': r'(Conductivity).*?(\d{1,4})',
			'res_dr': r'(Decay Resistance).*?(\d{1,4})',
			'res_fl': r'(Flavor).*?(\d{1,4})',
			'res_hr': r'(Heat Resistance).*?(\d{1,4})',
			'res_ma': r'(Malleability).*?(\d{1,4})',
			'res_pe': r'(Potential Energy).*?(\d{1,4})',
			'res_oq': r'(Overall Quality).*?(\d{1,4})',
			'res_sr': r'(Shock Resistance).*?(\d{1,4})',
			'res_ut': r'(Unit Toughness).*?(\d{1,4})'
		}
		
		for key, pattern in stat_patterns.items():
			match = re.search(pattern, raw_text, re.IGNORECASE)
			if match:
				# Group 2 is the number
				val = int(match.group(2))
				# Sanity check SWG stats range
				if 1 <= val <= 1000:
					extracted['stats'][key] = val
		print(f"Extracted -> {extracted}")
		return jsonify({"success": True, "data": extracted})

	except Exception as e:
		print(f"OCR Error: {e}")
		return jsonify({"error": "Failed to process image. Ensure Tesseract is installed on server."}), 500


if __name__ == '__main__':
	app.run(debug=True, port=5000)