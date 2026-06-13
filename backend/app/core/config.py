from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    JWT_SECRET: str
    MONGO_URI: str
    PORT: int = 5000
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"

    class Config:
        env_file = ".env"

settings = Settings()
