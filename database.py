"""

Database Context module


Currently supports the following databases:

- mysql
- postgresql
- mssql
- mariadb


"""
#STDLIB
import mysql
import mariadb
import psycopg
import pymssql

#MYLIB
from core import Config



class DatabaseContext:
	"""
	
	Base class for connection to a database
	
	"""
	DRIVERS = {
		"MSSQL": 		pymssql,
		"MARIADB": 		mariadb,
		"POSTGRESQL": 	psycopg.Connection,
		"MYSQL": 		mysql.connector,
	}

	def __init__(self, db = None):
		self.db = db
		self.conn = None
		self.config = Config()
		

	def _connect(self):
		# TODO - Implement grabbing pertinent values from config module
		host = None
		port = None
		user = None
		
		# TODO - Implement securely grabbing the secret
		secret = None
		
		# TODO - Implement connection context on a per-driver basis
		if not self.conn:
			# Use specified database driver, else try mysql driver as default
			pass

	def _write_query(self, query, multi=False):

		# TODO - Implement submit query on a per-driver basis
		pass



class MYSQLContext:
	"""
	
	Overload class for MYSQL-specific databases
	
	"""
	def __init__(self):
		pass
