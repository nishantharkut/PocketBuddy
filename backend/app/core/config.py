from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    JWT_SECRET: str
    MONGO_URI: str
    PORT: int = 8000
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SESSION_TOKEN: str = ""
    AWS_REGION: str = "ap-south-1"
    CAMPUS_FOOD_S3_BUCKET: str = ""
    CAMPUS_FOOD_S3_KEY: str = "campus_food.json"
    BEDROCK_ENABLED: bool = False
    BEDROCK_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "us.amazon.nova-lite-v1:0"

    class Config:
        env_file = ".env"

settings = Settings()
