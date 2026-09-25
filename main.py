from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uuid # библиотека для генерации идентификаторов
# компонент FastApi который добавляет заголовки для разрешения кросс-доменых запросов
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# теперь есть ключи/ID и список клиентов, что находятся в этой комнате
rooms: dict[str, list[WebSocket]] = {}
#endpoint который принимает WS подключения

@app.post("/create_room")
async def create_room():
    # генерация случайного идентификатора
    room_id = str(uuid.uuid4())[:8]
    rooms[room_id] = []
    """
    FastAPI автоматически превратит этот Python-словарь в JSON-ответ.
    Клиент получит что-то вроде {"room_id": "a1b2c3d4"}
    """
    return {"room_id": room_id}

@app.websocket("/ws/{room_id}") # добавление пути для FastAPI {room_id}
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    if room_id not in rooms: # если комнаты еще нет
        rooms[room_id] = [] # создаем для нее список
    rooms[room_id].append(websocket) # добавляем клиента в этот список

    try:
        while True:
            #ждем сообщение от клиента
            message = await websocket.receive_text()
            for client in rooms[room_id]: # переборка подключенных
                # пропускаем самого отправителя(не отправляем эхом его же сообщение
                if client != websocket:
                    await client.send_text(message) # пересылаем сообщение всем
    except WebSocketDisconnect:
        # отключение клиента из списка
        rooms[room_id].remove(websocket)
        if not rooms[room_id]:
            del rooms[room_id] # если комната пустая, удаляем её из словаря целиком
