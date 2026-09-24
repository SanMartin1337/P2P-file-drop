from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

# список где храним все WebSocket подключения
connected_clients: list[WebSocket] = []

@app.websocket("/ws") #endpoint который принимает WS подключения
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)

    try:
        while True:
            #ждем сообщение от клиента
            message = await websocket.receive_text()
            for client in connected_clients: # переборка всех подключенных
                # пропускаем самого отправителя(не отправляем эхом его же сообщение
                if client != websocket:
                    await client.send_text(message) # пересылаем сообщение всем
    except WebSocketDisconnect:
        # отключение клиента из списка
        connected_clients.remove(websocket)
