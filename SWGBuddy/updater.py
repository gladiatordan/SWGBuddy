import time
import subprocess
import logging
import sys
import os
import shutil

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

def update_frontend():
    """Builds the React application and deploys artifacts to Flask folders."""
    logger.info("Starting Frontend Build Process...")
    
    # Path to the frontend source
    frontend_path = os.path.join(REPO_DIR, 'SWGBuddy', 'frontend')
    
    try:
        # 1. Install Node dependencies
        logger.info("Installing NPM dependencies...")
        run_command(['npm', 'install'], cwd=frontend_path)
        
        # 2. Generate production build (Vite usually outputs to 'dist')
        logger.info("Running npm build...")
        run_command(['npm', 'run', 'build'], cwd=frontend_path)
        
        # 3. Define deployment targets
        dist_path = os.path.join(frontend_path, 'dist')
        flask_static = os.path.join(REPO_DIR, 'SWGBuddy', 'static')
        flask_templates = os.path.join(REPO_DIR, 'SWGBuddy', 'templates')

        # 4. Deploy index.html to templates
        logger.info("Copying index.html to templates...")
        shutil.copy(
            os.path.join(dist_path, 'index.html'), 
            os.path.join(flask_templates, 'index.html')
        )
        
        # 5. Sync static assets (JS/CSS)
        logger.info("Syncing static assets...")
        # Clean old build artifacts to prevent clutter
        if os.path.exists(flask_static):
            for item in os.listdir(flask_static):
                item_path = os.path.join(flask_static, item)
                # Keep legacy images if necessary, otherwise remove all for a clean React build
                if os.path.isfile(item_path) or os.path.islink(item_path):
                    os.unlink(item_path)
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
        
        # Copy everything from dist (except index.html) to static
        for item in os.listdir(dist_path):
            if item == 'index.html': continue
            s = os.path.join(dist_path, item)
            d = os.path.join(flask_static, item)
            if os.path.isdir(s):
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)

        logger.info("Frontend deployment complete.")
    except Exception as e:
        logger.error(f"Frontend build failed: {e}")
        raise

def perform_update():
	"""Stops services, pulls code, restarts backend, waits, restarts frontend."""
	logger.info("Initiating Update Protocol...")
	
	try:
		# 1. Stop Services
		logger.info("Stopping Services...")
		# run_command(["sudo", "systemctl", "stop", "swgbuddy"])         # Stop Frontend first
		run_command(["sudo", "systemctl", "stop", "swgbuddy-backend"]) # Stop Backend second
		
		# 2. Pull Code
		logger.info("Pulling latest code...")
		run_command(["git", "pull"], cwd=REPO_DIR)
		
		update_frontend()
		
		# 3. Start Backend
		logger.info("Starting Backend...")
		run_command(["sudo", "systemctl", "start", "swgbuddy-backend"])
		
		# 4. Wait for Socket Creation
		logger.info("Waiting for Backend initialization (5s)...")
		# time.sleep(5)
		
		# run_command(["sudo", "systemctl", "start", "swgbuddy"])
		logger.info("Update Protocol Complete. Services Restored.")
		
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