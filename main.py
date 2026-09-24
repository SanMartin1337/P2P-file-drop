from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

# список где храним все WebSocket подключения
connected_clients: list[WebSocket] = []

@app.websocket("/ws") #endpoint который принимает WS подключения
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)