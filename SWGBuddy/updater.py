import time
import subprocess
import logging
import sys
import os

# Configuration
POLL_INTERVAL = 15  # Check every 60 seconds
REPO_DIR = "/home/swgbuddy/SWGBuddy"
BRANCH = "main"

# Logging Setup
logging.basicConfig(
	level=logging.INFO,
	format='%(asctime)s [%(levelname)s] UPDATER: %(message)s',
	handlers=[
		logging.FileHandler("/opt/swgbuddy/logs/updater.log"),
		logging.StreamHandler(sys.stdout)
	]
)
logger = logging.getLogger()

def run_command(cmd, cwd=None):
	"""Helper to run shell commands and return output."""
	try:
		result = subprocess.run(
			cmd, 
			cwd=cwd, 
			check=True, 
			stdout=subprocess.PIPE, 
			stderr=subprocess.PIPE,
			text=True
		)
		return result.stdout.strip()
	except subprocess.CalledProcessError as e:
		logger.error(f"Command failed: {' '.join(cmd)}\nError: {e.stderr}")
		raise

def check_for_updates():
	"""Fetches origin and compares local HEAD to remote HEAD."""
	try:
		# 1. Fetch latest meta-data
		run_command(["git", "fetch"], cwd=REPO_DIR)
		
		# 2. Get Hashes
		local_hash = run_command(["git", "rev-parse", "HEAD"], cwd=REPO_DIR)
		remote_hash = run_command(["git", "rev-parse", "origin/master"], cwd=REPO_DIR)
		
		if local_hash != remote_hash:
			logger.info(f"Update Detected! Local: {local_hash[:7]} -> Remote: {remote_hash[:7]}")
			return True
		return False
	except Exception as e:
		logger.error(f"Git Check Failed: {e}")
		return False

def perform_update():
	"""Stops services, pulls code, restarts backend, waits, restarts frontend."""
	logger.info("Initiating Update Protocol...")
	
	FRONTEND_DIR = os.path.join(REPO_DIR, "SWGBuddy", "frontend")
	BACKEND_STATIC = os.path.join(REPO_DIR, "SWGBuddy", "static")
	BACKEND_TEMPLATES = os.path.join(REPO_DIR, "SWGBuddy", "templates")
	DIST_DIR = os.path.join(FRONTEND_DIR, "dist")
	
	try:
		# 1. Stop Services
		logger.info("Stopping Services...")
		run_command(["sudo", "systemctl", "stop", "swgbuddy-backend"]) # Stop Backend second
		
		# 1. Pull Code
		logger.info("Pulling latest code...")
		run_command(["git", "pull"], cwd=REPO_DIR)
		
		# 2. Build Frontend
		logger.info("Installing dependencies and building frontend...")
		# Note: 'npm install' ensures new packages are added
		run_command(["npm", "install"], cwd=FRONTEND_DIR)
		run_command(["npm", "run", "build"], cwd=FRONTEND_DIR)

		# 3. Clean and Move Assets
		logger.info("Cleaning old assets and moving new build...")
		
		# Clean existing static assets and templates
		run_command(["rm", "-rf", f"{BACKEND_STATIC}/*"])
		
		# Move everything from dist/assets to backend/static
		# (Vite puts JS/CSS in 'assets' folder by default)
		run_command(["cp", "-r", f"{DIST_DIR}/assets/.", BACKEND_STATIC])
		
		# Move index.html to templates
		run_command(["cp", f"{DIST_DIR}/index.html", f"{BACKEND_TEMPLATES}/index.html"])

		# Move favicon/other root files if they exist in dist
		if os.path.exists(os.path.join(DIST_DIR, "favicon.ico")):
			run_command(["cp", f"{DIST_DIR}/favicon.ico", BACKEND_STATIC])

		# 4. Restart Backend Service
		logger.info("Restarting Backend Service...")
		run_command(["sudo", "systemctl", "restart", "swgbuddy-backend"])
		
		logger.info("Update Protocol Complete. Frontend assets deployed and Backend Restored.")
		
	except Exception as e:
		logger.critical(f"Update Failed! Manual intervention may be required. Error: {e}")

if __name__ == "__main__":
	logger.info("SWGBuddy Auto-Updater Started. Monitoring repository...")
	
	while True:
		try:
			if check_for_updates():
				perform_update()
			else:
				# logger.debug("No updates found.")
				pass
		except Exception as e:
			logger.error(f"Main Loop Error: {e}")
		
		time.sleep(POLL_INTERVAL)