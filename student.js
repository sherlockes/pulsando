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
let heartbeatInterval = null;
let isFocused = true;

window.addEventListener('focus', () => { isFocused = true; });
window.addEventListener('blur', () => { isFocused = false; });

window.onerror = (msg, url, line, col, error) => {
    alert(`Error Global (Alumno): ${msg}\nEn ${url}:${line}`);
    return false;
};

const screens = {
    join: document.getElementById('screen-join-session'),
    buzzer: document.getElementById('screen-student-buzzer')
};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

// Unirse a Clase
document.getElementById('btn-join-session').onclick = async () => {
    const className = document.getElementById('input-join-class').value.trim();
    const name = document.getElementById('input-student-name').value.trim();
    const code = document.getElementById('input-join-code').value.trim();

    if (!name || !code || !className) {
        alert("Por favor, rellena todos los campos.");
        return;
    }

    if (name.length > 10) {
        alert("El nombre no puede tener más de 10 letras.");
        return;
    }

    try {
        const sessionRef = doc(db, "sessions", code);
        const sessionSnap = await getDoc(sessionRef);
        
        if (!sessionSnap.exists()) throw "SESSION_NOT_FOUND";
        if (sessionSnap.data().locked) throw "SESSION_LOCKED";
        if (sessionSnap.data().className.toLowerCase() !== className.toLowerCase()) throw "CLASS_NAME_MISMATCH";

        // Intentamos unirnos
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
                lastSeen: serverTimestamp(),
                focused: true,
                penalty: false
            });

            document.getElementById('student-display-class').innerText = data.className;
        });

        currentSessionId = code;
        currentStudentName = name;
        sessionStorage.setItem('currentStudentName', name);
        sessionStorage.setItem('currentSessionId', code);
        
        document.getElementById('student-display-name').innerText = name;

        startRealtimeListener(code);
        startKickListener(code, name); // Escuchar expulsión solo DESPUÉS de entrar
        startHeartbeat(code, name);
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
    // Acción de Pulsar
    document.getElementById('buzzer-button').addEventListener('click', async () => {
        if (!currentSessionId) {
            console.log('Ignored: No currentSessionId');
            return;
        }
        if (penaltyActive) {
            console.log('Ignored: Penalty is active');
            return;
        }
        
        const buzzerBtn = document.getElementById('buzzer-button');
        buzzerBtn.disabled = true;

        if (hasUserPenalty && !buzzerBtn.classList.contains('active')) {
            console.log('Ignored: User has penalty and button not active');
            buzzerBtn.disabled = false;
            return;
        }

        const sessionRef = doc(db, "sessions", currentSessionId);
        try {
            const docSnap = await getDoc(sessionRef);
            if (!docSnap.exists()) {
                alert('La sesión ya no existe.');
                buzzerBtn.innerText = originalText;
                buzzerBtn.disabled = false;
                return;
            }
            const data = docSnap.data();
            console.log('Session data before press:', data);
            
            if (!data.active) {
                console.log('Session not active, applying penalty');
                applyPenalty();
                buzzerBtn.innerText = originalText;
                buzzerBtn.disabled = false;
                return;
            }

            await runTransaction(db, async (transaction) => {
                const tDoc = await transaction.get(sessionRef);
                const tData = tDoc.data();
                
                // Si no tenemos el nombre en memoria, intentamos recuperarlo
                if (!currentStudentName) {
                    currentStudentName = sessionStorage.getItem('currentStudentName') || "Anónimo";
                }

                console.log('Transaction check - Active:', tData.active, 'Winner:', tData.winner);
                
                // Condición: Que esté activo y que no haya ganador aún
                if (tData.active && (!tData.winner || tData.winner === null)) {
                    console.log('Updating Firestore with winner:', currentStudentName);
                    
                    transaction.update(sessionRef, {
                        winner: { 
                            name: currentStudentName, 
                            timestamp: serverTimestamp() 
                        },
                        active: false
                    });
                    
                    const studentRef = doc(db, "sessions", currentSessionId, "students", currentStudentName);
                    transaction.update(studentRef, { penalty: false });
                    console.log('Transaction commit sent');
                } else {
                    throw "NOT_ACTIVE_OR_ALREADY_WON";
                }
            });
            console.log('Transaction success');
            buzzerBtn.innerText = "¡GANASTE!";
            buzzerBtn.style.background = "var(--secondary)";
        } catch (e) {
            console.error("Error en transacción:", e);
            buzzerBtn.disabled = false;
        }
    });

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

function startHeartbeat(sessionId, studentName) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    const studentRef = doc(db, "sessions", sessionId, "students", studentName);
    
    heartbeatInterval = setInterval(async () => {
        try {
            await updateDoc(studentRef, { 
                lastSeen: serverTimestamp(),
                focused: isFocused 
            });
        } catch (e) {
            console.error("Error en el latido de presencia:", e);
            // Si el documento ya no existe (expulsado), paramos el latido
            if (e.code === 'not-found') clearInterval(heartbeatInterval);
        }
    }, 20000); // Cada 20 segundos
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

    // Resetear visuales del botón por si venimos de una victoria anterior
    buzzerBtn.innerText = "PULSAR";
    buzzerBtn.style.background = "";
    buzzerBtn.disabled = false;

    if (data.countdown && data.countdown > 0) {
        statusBadge.innerText = "¡PREPÁRATE!";
        statusBadge.className = "status-badge status-active";
        buzzerBtn.innerText = data.countdown;
        buzzerBtn.classList.remove('active');
        return;
    }

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
