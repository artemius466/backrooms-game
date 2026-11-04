import subprocess, sys
r = subprocess.run(["./node_modules/.bin/vite", "build"])
sys.exit(r.returncode)
