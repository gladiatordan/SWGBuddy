"""

Cache Manager Module


"""
import json
import os
from core.core import Core
from core.database import DatabaseContext


class CacheService(Core):
	"""
	Class which manages cached assets for SWGBuddy

	"""
	def __init__(self, input_queue, log_queue, reply_queue=None):
		super().__init__(log_queue)
		self.input_queue = input_queue
		self.reply_queue = reply_queue
		self.running = True
		