import time
import signal
import sys
import multiprocessing
from dotenv import load_dotenv
from services.logger import LogService
from services.cache import CacheManager
from services.validation import ValidationService
from services.web import WebService



class ServiceManager:
    def __init__(self):
        self.running = True
        self.processes = []
        
        # Shared Queues
        self.log_queue = multiprocessing.Queue()
        self.validation_queue = multiprocessing.Queue()
        # FIX 1: Add the missing reply queue
        self.reply_queue = multiprocessing.Queue()
        self.cache = CacheManager()
        self.cache.initialize() # Loads DB once into shared memory

    def start(self):
        print("[Manager] Spawning Services...")

        services = [
            ("Logger", LogService, (self.log_queue,)),
            ("Validation", ValidationService, (self.validation_queue, self.log_queue, self.reply_queue, self.cache)),
            ("Web", WebService, (self.validation_queue, self.log_queue, self.reply_queue, self.cache))
        ]

        for name, cls, args in services:
            # FIX 3: Use the static method (ServiceManager._wrapper) instead of self._wrapper
            # This prevents pickling the 'self' instance which holds unpickleable Process objects
            p = multiprocessing.Process(target=ServiceManager._wrapper, args=(name, cls, args), name=name)
            p.start()
            self.processes.append(p)
            print(f"[Manager] {name} started (PID: {p.pid})")

        self._monitor()

    # FIX 4: Convert to staticmethod so it doesn't require 'self'
    @staticmethod
    def _wrapper(name, cls, args):
        try:
            service = cls(*args)
            service.run()
        except Exception as e:
            print(f"[Manager] {name} Died: {e}")
            sys.exit(1)

    def _monitor(self):
        while self.running:
            time.sleep(1)
            # Optional: Check if processes are alive and restart them
            for p in self.processes:
                if not p.is_alive():
                     # Simple log for now
                     pass

    def stop(self, signum, frame):
        print("\n[Manager] Stopping...")
        self.running = False
        for p in self.processes:
            if p.is_alive():
                p.terminate()
        sys.exit(0)

if __name__ == "__main__":
    load_dotenv() # Load environment into os.environ (local dev mode)
    multiprocessing.freeze_support()
    manager = ServiceManager()
    signal.signal(signal.SIGINT, manager.stop)
    
	# 1. Initialize Cache FIRST (This blocks until the DB is read)
    print("[Main] Pre-loading Cache Manager...")
    try:
        manager.cache.initialize()
        print("[Main] Cache ready.")
    except Exception as e:
        print(f"[Main] FATAL: Cache failed to initialize: {e}")
        sys.exit(1)
    
	# 2. Start Manager AFTER CacheManager is fully loaded
    manager.start()