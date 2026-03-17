from fastapi import FastAPI

# Create FastAPI app
app = FastAPI(title="Simple Test App")

@app.get("/")
async def root():
    return {"message": "Chat app is running"}

@app.get("/api/test")
async def test_endpoint():
    return {"message": "API is working", "status": "ok"}

@app.post("/api/upload")
async def upload_file():
    return {
        "message": "File upload endpoint working",
        "test": True,
        "file_url": "/uploads/test.txt",
        "file_size": 1024
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
