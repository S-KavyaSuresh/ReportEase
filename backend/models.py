from pydantic import BaseModel
from typing import Optional


class ChatRequest(BaseModel):
    session_id: str
    message: str
    language: str


class HospitalRequest(BaseModel):
    location: str
    specialist: str
    language: str
    session_id: str
