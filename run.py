import os
import sys
import subprocess

def check_and_install_dependencies():
    print("Checking dependencies...")
    try:
        import fastapi
        import uvicorn
        import langchain
        import chromadb
        import pydantic
        import pandas
        import pypdf
        print("All dependencies are already installed.")
    except ImportError as e:
        print(f"Missing dependency detected: {e.name}. Installing from requirements.txt...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
            print("Dependencies installed successfully.")
        except Exception as err:
            print(f"Failed to install dependencies: {err}")
            sys.exit(1)

def run_server():
    print("Starting FastAPI Backend Server on port 8000...")
    try:
        import uvicorn
        uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
    except KeyboardInterrupt:
        print("\nServer stopped by user.")
    except Exception as e:
        print(f"Error starting server: {e}")

if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    check_and_install_dependencies()
    run_server()
