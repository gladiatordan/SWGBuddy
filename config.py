"""

Config module for RestoBuddy


"""

#stdlib
import os

#3rdparty
import watchdog

#mylib
from core import Serializable



class Config(Serializable):
	"""
	
	Singleton instance which monitors and controls 

	- reads the cwd/config directory and loads it into memory in dictionary format
	- directories found within the "configs" directory are treated as keys and parsed recursively by directory name
	
	- Example if directory looked like this

	configs/
			battlefields/
						config1.json
						config2.json
						config3.json
			resources/
						config1.json
						config2.json
			core.json
	
	Config would read like this

	self.data = {

		"battlefields": {
			"config1": {},
			"config2": {},
			"config3": {},

		},

		"resources": {
			"config1": {},
			"config2": {},

		},

		"core": {},
	}
	
	"""
	_instance = None

	def __new__(cls, *args, **kwargs):
		if cls._instance is None:
			cls._instance = super().__new__(cls)
		return cls._instance
	

	def __init__(self):
		super().__init__()
		self.cfg_dir = os.path.join(os.getcwd(), "configs")

		# TODO - implement watchdog for config file changes
		pass

	
	def get(self, cfg: str) -> any | None:
		# attempts to get the value found at specified 'cfg'
		# uses '.' delimiter to denote hierarchy
		# returns None if KeyError is raised
		try:
			if "." in cfg:
				keys = cfg.split(".")
				pos = self.__dict__[keys[0]]
				
				for k in keys[1:]:
					pos = pos[k]
				return pos
			else:
				return self.__dict__[cfg]
		except KeyError:
			return None