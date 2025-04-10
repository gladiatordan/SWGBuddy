"""

Config module for RestoBuddy


"""

#stdlib
import os
import json

#3rdparty
import watchdog

#mylib
from core import Core, Serializable



class Config(Core, Serializable, watchdog.events.FileSystemEventHandler):
	"""
	
	Singleton instance which monitors and controls 

	- reads the cwd/config directory and loads it into memory in dictionary format
	- we keep it stored in memory because the reads are faster and this project is small enough that the footprint is negligible
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

		# load the config for the first time
		self._load_config(self.__dict__, self.cfg_dir)

		# TODO - implement watchdog for config file changes
		pass


	def _load_config(self, pos, fp):
		# TODO - implement this
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


	def on_modified(self, event):
		# config file was modified, we need to load the new config into memory
		cfg_name = os.path.splitext(os.path.basename(event.src_path))[0]
		cfg_data = json.load(event.src_path)

		# determine where in our config this is supposed to go
		cfg_keys = os.path.splitext(event.src_path)[-1].split(self.cfg_dir)[-1].split(os.sep)[1:]
		pos = self.__dict__
		for k in cfg_keys:
			pos = pos[k.replace(".json", "")]

		# finally, update the data
		pos.update(cfg_data)