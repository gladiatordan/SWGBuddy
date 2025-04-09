"""

Core module for RestoBuddy

"""

#stdlib
import json
import inspect
import logging
import threading



class Core:
    """
    
    Base class containing utils to be used by other objects
    
    """
    def __init__(self):
        # figure out which module called us
        self.mod = self._get_caller_module()
        
        # setup logger
        self._get_logger()

        # get Manager instance
        self.mgr = Manager()


    def _get_caller_module(self):
        frame  = inspect.currentframe().f_back
        module = inspect.getmodule(frame)
        return module.__name__ if module else None
    

    def _get_logger(self):
        # get logging instance, use root logger if module is None
        if not self.mod:
            self.logger = logging.getLogger()
        else:
            self.logger = CoreLogger().get_logger(self.mod)


    def _log(self, message, level):
        # if logger is not attached to this instance then we don't log anything
        if not self.logger:
            return

        match level:
            case 10:
                self.logger.debug(message)
            case 20:
                self.logger.info(message)
            case 30:
                self.logger.warning(message)
            case 40:
                self.logger.error(message)
            case 50:
                self.logger.critical(message)
            case _:
                self.logger.warning(f"Level specified could not be read -> {level} | Using info level instead")
                self.logger.info(message)


    def debug(self, message):
        self._log(message, 10)


    def info(self, message):
        self._log(message, 20)

    
    def warning(self, message):
        self._log(message, 30)


    def error(self, message):
        self._log(message, 40)


    def critical(self, message):
        self._log(message, 50)



class Serializable:
    """
    
    Base class which overrides certain built-in functions and adds new ones
    
    """
    def __init__(self):
        pass


    def __str__(self):
        # produces a generic string representation of the instance's data attribute
        pass


    def __json__(self):
        # produces a json-serializable representation of the instance's data attribute
        pass
