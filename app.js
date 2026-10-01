let ws;

const CHUNK_SIZE = 16 * 1024; // 16 kb размерность 1 чанка

async function sendFile() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

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
        totalChunks: totalChunks
    };
    const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
    const encryptedMeta = await encryptPayload(MSG_TYPE_FILE_META, metaBytes);
    ws.send(encryptedMeta);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const chunkArrayBuffer = await chunkBlob.arrayBuffer();

        const encrypted = await encryptPayload(MSG_TYPE_FILE_CHUNK, chunkArrayBuffer);
        ws.send(encrypted);

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        document.getElementById("progressInfo").textContent = `отправлено: ${progress}%`;
    }

    document.getElementById("progressInfo").textContent = "файл отправлен";
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
            handleEncryptedMessage(event.data);
        }
    };
    ws.onclose = (event) => {
    if (event.code === 4000) {
        alert("Комната уже занята двумя участниками");
        document.getElementById("chatScreen").style.display = "none";
        document.getElementById("setupScreen").style.display = "block";
    } else {
        console.log("Соединение закрыто");
    }
    };
    function connectToRoom(roomId) {
    keysReady = generateMyKeys();

    ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    ws.binaryType = "arraybuffer";

}

function handleEncryptedMessage(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const typeByte = bytes[0];

    let index = null;
    if (typeByte === MSG_TYPE_FILE_CHUNK) {
        index = chunkCounter++;
    }

    decryptAndHandle(arrayBuffer, typeByte, index);
}

async function decryptAndHandle(arrayBuffer, typeByte, index) {
    const bytes = new Uint8Array(arrayBuffer);
    const iv = bytes.slice(1, 13);
    const cipherBuffer = bytes.slice(13);

    let plainBuffer;
    try {
        plainBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            sharedSecretKey,
            cipherBuffer
        );
    } catch (e) {
        console.error("Не удалось расшифровать сообщение", e);
        return;
    }

    if (typeByte === MSG_TYPE_FILE_META) {
        const text = new TextDecoder().decode(plainBuffer);
        receivingFile = JSON.parse(text);
        receivedChunks = [];
        chunkCounter = 0;
        decryptedCount = 0;
        document.getElementById("progressInfo").textContent =
            `получаем файл ${receivingFile.name} (0%)`;

    } else if (typeByte === MSG_TYPE_CHAT) {
        const text = new TextDecoder().decode(plainBuffer);
        const messagesList = document.getElementById("messages");
        const item = document.createElement("li");
        item.textContent = text;
        messagesList.appendChild(item);

    } else if (typeByte === MSG_TYPE_FILE_CHUNK) {
        receivedChunks[index] = plainBuffer;
        decryptedCount++;

        const progress = Math.round((decryptedCount / receivingFile.totalChunks) * 100);
        document.getElementById("progressInfo").textContent =
            `Получаем файл: ${receivingFile.name} (${progress}%)`;

        if (decryptedCount === receivingFile.totalChunks) {
            finishReceivingFile();
        }
    }
}


function handleTextMessage(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        parsed = null;
    }

    if (parsed && parsed.type === "public_key") {
        handlePublicKeyMessage(parsed.key);
    }
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

async function sendMessage() {
    const input = document.getElementById("messageInput");
    const text = input.value;

    const textBytes = new TextEncoder().encode(text);
    const encrypted = await encryptPayload(MSG_TYPE_CHAT, textBytes);
    ws.send(encrypted);

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

const MSG_TYPE_FILE_CHUNK = 1;
const MSG_TYPE_CHAT = 2;
const MSG_TYPE_FILE_META = 3;

async function encryptPayload(typeByte, plainBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedSecretKey,
        plainBuffer
    );

    const result = new Uint8Array(1 + 12 + cipherBuffer.byteLength);
    result[0] = typeByte;
    result.set(iv, 1);
    result.set(new Uint8Array(cipherBuffer), 13);
    return result;
}





