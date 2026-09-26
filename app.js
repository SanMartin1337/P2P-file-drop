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

let receivingFile = null;
let receivedChunks = []

function connectToRoom(roomId) {
    ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    ws.onopen = () => {
        console.log("соединение установлено, комната: ", roomId);
    };

    ws.onmessage = (event) => {
        if (typeof event.data === "string") {
            handleTextMessage(event.data);
        } else {
            handleBinaryChunk(event.data);
        }
    };
    ws.onclose = () => {
        console.log("Соединение закрыто");
    };
}

function handleTextMessage(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        parsed = null
    }
    if (parsed && parsed.type === "file_meta"){
        receivingFile = parsed;
        receivedChunks = [];
        document.getElementById("progressInfo").textContent =
            `получаем файл ${parsed.name} (0%)`;
        return;
    }

    const messagesList = document.getElementById("messages")
    const item = document.createElement("li")
    item.textContent = text;
    messagesList.appendChild(item);
}

async function handleBinaryChunk(blob) {
    receivedChunks.push(blob);

    const progress = Math.round((receivedChunks.length / receivingFile.totalChunks) * 100);
    document.getElementById("progressInfo").textContent =
        `Получаем файл: ${receivingFile.name} (${progress}%)`;

    if (receivedChunks.length === receivingFile.totalChunks) {
        finishReceivingFile();
    }
}

function finishReceivingFile() {
    const fileBlob = new Blob(receivedChunks);
    const url = URL.createObjectURL(fileBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = receivingFile.name;
    link.textContent = `Скачать ${receivingFile.name}`;

    document.getElementById("progressInfo").appendChild(document.createElement("br"));
    document.getElementById("progressInfo").appendChild(link);

    receivingFile = null;
    receivedChunks = [];
}

function sendMessage() {
    const input = document.getElementById("messageInput");
    ws.send(input.value);
    input.value = "";
}

async function testGenerateKeys() {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey", "deriveBits"]

    );

    console.log("пара ключей сгенерирована", keyPair);
    console.log("приватный ключ", keyPair.privateKey);
    console.log("публичный ключ", keyPair.publicKey);

    const exportedPublicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    console.log("пбличный ключ в виде байтов:", new Uint8Array(exportedPublicKey));
}

testGenerateKeys();
