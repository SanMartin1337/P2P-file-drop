let ws;

const CHUNK_SIZE = 16 * 1024; // 16 kb размерность 1 чанка

async function sendFile() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0]


    if (!file) {
        alert("сперва выберите файл");
        return;
    }

    if (!sharedSecretKey) {
    alert("защищённый канал ещё не установлен, подожди секунду");
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
        const encrypted = await encryptChunk(chunkArrayBuffer);
        ws.send(encrypted);

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
    isCreator = true;
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
    isCreator = false;
    connectToRoom(roomId);
}

function enterChatScreen(roomId) {
    document.getElementById("setupScreen").style.display = "none";
    document.getElementById("chatScreen").style.display = "block";
    document.getElementById("roomInfo").textContent = "комната: " + roomId;
}

let receivingFile = null;
let receivedChunks = []
let isCreator = false;
let keysReady = null;

function connectToRoom(roomId) {
    keysReady = generateMyKeys();

    ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    ws.onopen = async () => {
        console.log("соединение установлено, комната: ", roomId);
        if (!isCreator) {
            await keysReady;
            await sendMyPublicKey();
        }
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
        chunkCounter = 0;
        decryptedCount = 0;
        document.getElementById("progressInfo").textContent =
            `получаем файл ${parsed.name} (0%)`;
        return;
    }
    if (parsed && parsed.type === "public_key") {
    handlePublicKeyMessage(parsed.key);
    return;
    }

    const messagesList = document.getElementById("messages")
    const item = document.createElement("li")
    item.textContent = text;
    messagesList.appendChild(item);
}

async function handlePublicKeyMessage(keyArray) {
    await keysReady;
    await handleReceivedPublicKey(keyArray);

    if (isCreator) {
        await sendMyPublicKey();
    }
}

let chunkCounter = 0;
let decryptedCount = 0;

async function handleBinaryChunk(blob) {
    const index = chunkCounter++;

    let decrypted;
    try {
        decrypted = await decryptChunk(blob);
    } catch (e) {
        console.error("Не удалось расшифровать чанк", index, e);
        document.getElementById("progressInfo").textContent =
            "Ошибка: чанк повреждён или ключи не совпали";
        return;
    }

    receivedChunks[index] = decrypted;
    decryptedCount++;

    const progress = Math.round((decryptedCount / receivingFile.totalChunks) * 100);
    document.getElementById("progressInfo").textContent =
        `Получаем файл: ${receivingFile.name} (${progress}%)`;

    if (decryptedCount === receivingFile.totalChunks) {
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

let myKeyPair = null;
let sharedSecretKey = null;

async function generateMyKeys() {
    myKeyPair = await crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey", "deriveBits"]
    );
    console.log("Мои ключи сгенерированы");
}

async function sendMyPublicKey() {
    const exported = await crypto.subtle.exportKey("raw", myKeyPair.publicKey);
    const asArray = Array.from(new Uint8Array(exported));

    const message = {
        type: "public_key",
        key: asArray
    };
    ws.send(JSON.stringify(message));
    console.log("Отправил свой публичный ключ");
}

async function handleReceivedPublicKey(keyArray) {
    const keyBytes = new Uint8Array(keyArray);

    const theirPublicKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );

    sharedSecretKey = await crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: theirPublicKey
        },
        myKeyPair.privateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt", "decrypt"]
    );

    console.log("Общий секретный ключ вычислен:", sharedSecretKey);
}

async function encryptChunk(plainBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedSecretKey,
        plainBuffer
    );

    const result = new Uint8Array(12 + cipherBuffer.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(cipherBuffer), 12);
    return result;
}

async function decryptChunk(blob) {
    const buffer = await blob.arrayBuffer();

    const iv = new Uint8Array(buffer.slice(0, 12));
    const cipherBuffer = buffer.slice(12);

    return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        sharedSecretKey,
        cipherBuffer
    );

}




