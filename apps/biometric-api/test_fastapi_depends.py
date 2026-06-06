import asyncio
from fastapi import FastAPI, Depends, APIRouter
from fastapi.testclient import TestClient

class Repo:
    async def list_all(self): return []

async def make_repo(): return Repo()

class QueryEntitiesUseCase:
    def __init__(self, repository = Depends(make_repo)):
        self.repository = repository
    async def execute(self):
        return await self.repository.list_all()

def get_query_use_case(repo = Depends(make_repo)):
    return QueryEntitiesUseCase(repository=repo)

def build_endpoint(factory):
    async def endpoint(use_case = Depends(factory)):
        return await use_case.execute()
    return endpoint

app = FastAPI()
app.add_api_route("/test", build_endpoint(get_query_use_case))

client = TestClient(app)
try:
    print(client.get("/test").json())
except Exception as e:
    import traceback
    traceback.print_exc()
