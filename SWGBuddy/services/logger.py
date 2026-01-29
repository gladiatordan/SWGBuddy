"""

Logging Service for SWGBuddy

Operates on its own process to ensure smooth logging transactions

"""
import logging
import logging.handlers
import sys
import os
import signal
import queue



class LogService:
	def __init__(self, input_queue):
		self.input_queue = input_queue
		self.running = True
		
		# Ensure log directory exists (Preserves behavior from previous setup)
		if os.getenv("APP_ENV") != "development":
			self.log_dir = "/opt/swgbuddy/logs"
		else:
			self.log_dir = os.path.join(os.getcwd(), "logs")
		try:
			os.makedirs(self.log_dir, exist_ok=True)
		except OSError as e:
			print(f"[LogService] Failed to create log directory: {e}", file=sys.stderr)
			
		self.log_file = os.path.join(self.log_dir, "swgbuddy-backend.log")
		print(f"[LogService] Log File at -> {self.log_file}")

	def run(self):
		# Ignore SIGINT in this process so the ServiceManager can handle the shutdown signal
		signal.signal(signal.SIGINT, signal.SIG_IGN)

		# 1. Initialize the internal Python Logger
		# We use a specific name 'SWGBuddy' to isolate our logs
		logger = logging.getLogger("SWGBuddy")
		logger.setLevel(logging.DEBUG) # Capture everything, handlers will filter
		
		# Prevent adding duplicate handlers if service restarts
		if not logger.handlers:
			# 2. File Handler (Persistent logs)
			# Rotates at 5MB, keeps 5 backup files.
			try:
				file_handler = logging.handlers.RotatingFileHandler(
					self.log_file, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8'
				)
				file_handler.setLevel(logging.INFO)
				file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
				logger.addHandler(file_handler)
			except Exception as e:
				print(f"[LogService] Failed to setup file logging: {e}", file=sys.stderr)

			# 3. Console Handler (Live debug output for your terminal)
			console_handler = logging.StreamHandler(sys.stdout)
			console_handler.setLevel(logging.DEBUG) # Show debugs in console
			console_handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
			logger.addHandler(console_handler)
		
		logger.info("[LogService] Service Started. Listening for messages...")

		# 4. The Event Loop
		while self.running:
			try:
				# Blocking get: efficient because it waits until a log arrives
				record = self.input_queue.get()
				
				# Shutdown Sentinel: None signals the loop to stop
				if record is None:
					self.running = False
					break
				
				# 5. Parse Payload
				# Expected Format: {"level": "INFO", "source": "Web", "msg": "Something happened"}
				level_str = record.get("level", "INFO").upper()
				source = record.get("source", "System")
				msg = record.get("msg", "")
				
				# Convert string level (e.g., "ERROR") to logging constant (e.g., 40)
				level = getattr(logging, level_str, logging.INFO)
				
				# Format: [Source] Message
				# We format it here so the file/console handlers just output the final string
				final_msg = f"[{source}] {msg}"
				
				# Write to handlers
				logger.log(level, final_msg)

			except KeyboardInterrupt:
				# Fallback in case signal handling fails
				self.running = False
				break
			except Exception as e:
				# If the logging system itself crashes, print to stderr as a last resort
				print(f"[LogService] CRITICAL FAILURE: {e}", file=sys.stderr)
		
		logger.info("[LogService] Shutdown Complete.")