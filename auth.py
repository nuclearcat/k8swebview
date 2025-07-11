from typing import Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from passlib.context import CryptContext
import yaml
from pathlib import Path

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBasic()

AUTH_CONFIG_PATH = Path(__file__).parent / "data" / "auth.yaml"


class AuthManager:
    def __init__(self):
        self.config = self._load_config()
        self.users = {user["username"]: user["password_hash"] for user in self.config.get("users", [])}

    def _load_config(self) -> Dict:
        """Load authentication configuration from YAML file."""
        if not AUTH_CONFIG_PATH.exists():
            raise FileNotFoundError(f"Authentication config not found at {AUTH_CONFIG_PATH}")
        
        with open(AUTH_CONFIG_PATH, "r") as f:
            return yaml.safe_load(f)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def authenticate_user(self, username: str, password: str) -> bool:
        """Authenticate a user with username and password."""
        if username not in self.users:
            return False
        return self.verify_password(password, self.users[username])


auth_manager = AuthManager()


async def get_current_user(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    """Dependency to get the current authenticated user."""
    if not auth_manager.authenticate_user(credentials.username, credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username