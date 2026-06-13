from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import json
import boto3
from app.core.config import settings
from app.core.security import get_current_user
import os

router = APIRouter()

class RagReq(BaseModel):
    days_left: int
    remaining_budget: float
    spent_today: float

# Load static campus food once
def load_campus_food():
    food_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'campus_food.json')
    try:
        with open(food_path, 'r') as f:
            return json.load(f)
    except Exception:
        return []

campus_foods = load_campus_food()

@router.post("/food-rag")
async def get_food_recommendation(req: RagReq, user_id: str = Depends(get_current_user)):
    if not settings.AWS_ACCESS_KEY_ID:
        # Fallback if Bedrock is not configured
        if not campus_foods: return {"recommendation": "No food data available."}
        cheapest = sorted(campus_foods, key=lambda x: x["price"])[0]
        return {"recommendation": f"Bedrock not configured. Local fallback: Try {cheapest['item_name']} at {cheapest['venue']} for {cheapest['price']} Rs."}
        
    try:
        client = boto3.client(
            service_name="bedrock-runtime",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY
        )
        
        prompt = f"""
        You are an AI financial assistant for a college student.
        The student has {req.days_left} days left in their cycle and only {req.remaining_budget} Rs remaining.
        They have spent {req.spent_today} Rs today.
        
        Here are the available campus food options:
        {json.dumps(campus_foods, indent=2)}
        
        Analyze their runway and suggest exactly one cost-effective food option from the list.
        Provide a very short, encouraging 2-sentence response telling them what to eat and why it fits their tight budget.
        """
        
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 150,
            "messages": [{"role": "user", "content": prompt}]
        })
        
        response = client.invoke_model(
            body=body,
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            accept="application/json",
            contentType="application/json"
        )
        
        res_body = json.loads(response.get('body').read())
        recommendation = res_body.get('content')[0].get('text')
        
        return {"recommendation": recommendation}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bedrock error: {str(e)}")
