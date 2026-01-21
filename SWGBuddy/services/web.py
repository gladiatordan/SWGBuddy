"""
SWGBuddy WebService Module

Wrapper to run the Flask Frontend as a ServiceManager Process.

"""
import logging
from waitress import serve
from SWGBuddy.core.core import Core
from SWGBuddy.server import app, start_response_router, current_app



class WebService(Core):
    def __init__(self, validation_queue, log_queue, reply_queue, cache):
        super().__init__(log_queue)
        self.validation_queue = validation_queue
        self.reply_queue = reply_queue
        self.cache = cache

    def run(self):
        self.info("Initializing Web Service (Waitress)...")
        
        # 1. Inject Queues into Flask Config
        # Since we are in the same process tree (or forked from it), 
        # we can pass these objects directly.
        app.config['VAL_QUEUE'] = self.validation_queue
        
        # 2. Start the Response Router (Background Thread)
        start_response_router(self.reply_queue)
        
        # 3. Start Waitress
        # This blocks the process, serving requests indefinitely
        self.info("Starting HTTP Server on 0.0.0.0:5000")
        serve(app, host='0.0.0.0', port=5000, threads=6)