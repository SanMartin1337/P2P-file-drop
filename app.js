let ws;

const CHUNK_SIZE = 16 * 1024; // 16 kb размерность 1 чанка

async function sendFile() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0]


    if (!file) {
        alert("сперва выберите файл");
        return;
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const meta = {
        type: "file_meta",
        name: file.name,
        size: file.size,
        totalChunks:totalChunks
    };

    ws.send(JSON.stringify(meta));

    for(let i = 0; i<totalChunks; i++){
        const start = i * CHUNK_SIZE;
        // берём меньшее из двух значений: либо ровно на CHUNK_SIZE дальше, либо конец файла
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start,end)
        // превращаем Blob в реальные байты
        const chunkArrayBuffer = await chunkBlob.arrayBuffer();
        // отправка бинарного чанка
        ws.send(chunkArrayBuffer);

        // прогресс бар
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        document.getElementById("progressInfo").textContent = `отправлено: ${progress}%`;
    }

    document.getElementById("progressInfo").textContent = "файл отправлен "


}

async function handleCreateRoom(){
    const response = await fetch("http://127.0.0.1:8000/create_room", {
        method: "POST"
    });
    const data = await response.json();
    const roomId = data.room_id;

    enterChatScreen(roomId);
    connectToRoom(roomId);
}

function handleJoinRoom(){
    const input = document.getElementById("joinCodeInput");
    const roomId = input.value.trim();

    if (roomId === "") {
        alert("введите код комнаты");
        return;
    }

    enterChatScreen(roomId);
    connectToRoom(roomId);
}

function enterChatScreen(roomId) {
    document.getElementById("setupScreen").style.display = "none";
    document.getElementById("chatScreen").style.display = "block";
    document.getElementById("roomInfo").textContent = "комната: " + roomId;
}
function connectToRoom(roomId) {
    ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    ws.onopen = () => {
        console.log("соединение установлено, комната: ", roomId);
    };

    ws.onmessage = (event) => {
        const messageslist = document.getElementById("messages");
        const item = document.createElement("li");
        item.textContent = event.data;
        messageslist.appendChild(item);
    };
    ws.onclose = () => {
        console.log("Соединение закрыто");
    };
}


function sendMessage() {
    const input = document.getElementById("messageInput");
    ws.send(input.value);
    input.value = "";
}