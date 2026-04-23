import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    updateDoc,
    onSnapshot, 
    runTransaction,
    collection,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentSessionId = null;
let currentStudentName = "";
let penaltyActive = false; // Bloqueo por pulsar antes de tiempo
let hasUserPenalty = false; // Penalización por respuesta anterior incorrecta
let studentDocListener = null;

const screens = {
    join: document.getElementById('screen-join-session'),
    buzzer: document.getElementById('screen-student-buzzer')
};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

// Función para calcular el próximo domingo a las 00:00
function getNextSunday() {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Unirse a Clase
document.getElementById('btn-join-session').onclick = async () => {
    const className = document.getElementById('input-join-class').value;
    const name = document.getElementById('input-student-name').value;
    const code = document.getElementById('input-join-code').value;

    if (!name || !code || !className) {
        alert("Por favor, rellena todos los campos.");
        return;
    }

    try {
        const sessionRef = doc(db, "sessions", code);
        const sessionSnap = await getDoc(sessionRef);
        
        if (!sessionSnap.exists()) throw "SESSION_NOT_FOUND";
        if (sessionSnap.data().locked) throw "SESSION_LOCKED";
        if (sessionSnap.data().className.toLowerCase() !== className.toLowerCase()) throw "CLASS_NAME_MISMATCH";

        startKickListener(code, name);

        await runTransaction(db, async (transaction) => {
            const currentSnap = await transaction.get(sessionRef);
            const data = currentSnap.data();

            if ((data.studentCount || 0) >= data.maxStudents) throw "SESSION_FULL";

            transaction.update(sessionRef, {
                studentCount: (data.studentCount || 0) + 1
            });

            const studentRef = doc(db, "sessions", code, "students", name);
            transaction.set(studentRef, {
                name: name,
                joinedAt: serverTimestamp(),
                penalty: false,
                expireAt: getNextSunday() // <--- PARA BORRADO AUTOMÁTICO DEL ALUMNO
            });

            document.getElementById('student-display-class').innerText = data.className;
        });

        currentSessionId = code;
        currentStudentName = name;
        document.getElementById('student-display-name').innerText = name;

        startRealtimeListener(code);
        showScreen('buzzer');
    } catch (e) {
        if (studentDocListener) studentDocListener();
        if (e === "SESSION_NOT_FOUND") alert("PIN incorrecto.");
        else if (e === "SESSION_LOCKED") alert("Clase cerrada.");
        else if (e === "CLASS_NAME_MISMATCH") alert("Nombre de clase incorrecto.");
        else if (e === "SESSION_FULL") alert("Clase llena.");
        else console.error(e);
    }
};

function startKickListener(sessionId, studentName) {
    if (studentDocListener) studentDocListener(); 
    const studentRef = doc(db, "sessions", sessionId, "students", studentName);
    
    studentDocListener = onSnapshot(studentRef, (docSnap) => {
        if (!docSnap.exists() && currentSessionId) {
            currentSessionId = null;
            alert("Has sido expulsado.");
            window.location.reload(); 
        } else if (docSnap.exists()) {
            hasUserPenalty = docSnap.data().penalty || false;
        }
    });
}

// Acción de Pulsar
document.getElementById('buzzer-button').onclick = async () => {
    if (!currentSessionId || penaltyActive) return;

    const btn = document.getElementById('buzzer-button');
    if (hasUserPenalty && !btn.classList.contains('active')) return;

    const sessionRef = doc(db, "sessions", currentSessionId);
    
    try {
        const docSnap = await getDoc(sessionRef);
        const data = docSnap.data();

        if (!data.active) {
            applyPenalty();
            return;
        }

        await runTransaction(db, async (transaction) => {
            const tDoc = await transaction.get(sessionRef);
            const tData = tDoc.data();
            
            if (tData.active && !tData.winner) {
                transaction.update(sessionRef, {
                    winner: { name: currentStudentName, timestamp: serverTimestamp() },
                    active: false
                });
                
                const studentRef = doc(db, "sessions", currentSessionId, "students", currentStudentName);
                transaction.update(studentRef, { penalty: false });
            }
        });
    } catch (e) {
        console.error(e);
    }
};

async function applyPenalty() {
    penaltyActive = true;
    const btn = document.getElementById('buzzer-button');
    const badge = document.getElementById('student-status-badge');
    const penaltyTime = Math.floor(Math.random() * 4000) + 1000;
    
    btn.classList.add('penalty');
    badge.innerText = "¡BLOQUEADO POR ANSIA!";
    
    setTimeout(async () => {
        penaltyActive = false;
        btn.classList.remove('penalty');
        if (currentSessionId) {
            const docSnap = await getDoc(doc(db, "sessions", currentSessionId));
            if (docSnap.exists()) updateUI(docSnap.data());
        }
    }, penaltyTime);
}

function startRealtimeListener(sessionId) {
    onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
        if (!docSnap.exists()) return;
        updateUI(docSnap.data());
    });
}

function updateUI(data) {
    const buzzerBtn = document.getElementById('buzzer-button');
    const statusBadge = document.getElementById('student-status-badge');
    const winnerMsg = document.getElementById('student-winner-msg');

    if (penaltyActive) return;

    if (data.active) {
        if (hasUserPenalty) {
            statusBadge.innerText = "ESPERA... (PENALIZADO ⚡)";
            statusBadge.className = "status-badge status-waiting";
            buzzerBtn.classList.remove('active');
            
            setTimeout(() => {
                if (data.active && !penaltyActive && hasUserPenalty) {
                    statusBadge.innerText = "¡DALE YA!";
                    statusBadge.className = "status-badge status-active";
                    buzzerBtn.classList.add('active');
                }
            }, 1000);
        } else {
            statusBadge.innerText = "¡DALE YA!";
            statusBadge.className = "status-badge status-active";
            buzzerBtn.classList.add('active');
        }
    } else {
        statusBadge.innerText = "Esperando al profesor...";
        statusBadge.className = "status-badge status-waiting";
        buzzerBtn.classList.remove('active');
    }

    if (data.winner) {
        winnerMsg.classList.remove('hidden');
        const displayWinner = document.getElementById('student-winner-name');
        displayWinner.innerText = data.winner.name;
        displayWinner.style.color = (data.winner.name === currentStudentName) ? "#10b981" : "#f87171";
    } else {
        winnerMsg.classList.add('hidden');
    }
}
