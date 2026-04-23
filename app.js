import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    getDocs,
    runTransaction,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- ESTADO GLOBAL ---
let currentSessionId = null;
let currentStudentName = "";
let isTeacher = false;

// --- ELEMENTOS DOM ---
const screens = {
    home: document.getElementById('screen-home'),
    createSession: document.getElementById('screen-create-session'),
    teacherPanel: document.getElementById('screen-teacher-panel'),
    joinSession: document.getElementById('screen-join-session'),
    studentBuzzer: document.getElementById('screen-student-buzzer')
};

// --- NAVEGACIÓN ---
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

document.getElementById('btn-goto-teacher').onclick = () => showScreen('createSession');
document.getElementById('btn-goto-student').onclick = () => showScreen('joinSession');
document.querySelectorAll('.btn-back').forEach(btn => {
    btn.onclick = () => showScreen('home');
});

// --- LÓGICA DEL PROFESOR ---

document.getElementById('btn-create-session').onclick = async () => {
    const className = document.getElementById('input-class-name').value;
    const code = document.getElementById('input-class-code').value;
    const maxStudents = parseInt(document.getElementById('input-max-students').value);

    if (!className || code.length !== 4) {
        alert("Por favor, rellena los datos correctamente (Código de 4 dígitos).");
        return;
    }

    try {
        // Usamos el código como ID para simplificar (en un entorno real usaríamos IDs únicos)
        const sessionId = code; 
        const sessionRef = doc(db, "sessions", sessionId);

        await setDoc(sessionRef, {
            className,
            code,
            maxStudents,
            studentCount: 0,
            active: false,
            winner: null,
            createdAt: serverTimestamp()
        });

        currentSessionId = sessionId;
        isTeacher = true;
        
        document.getElementById('display-class-name').innerText = className;
        document.getElementById('display-class-code').innerText = code;
        
        startRealtimeListener(sessionId);
        showScreen('teacherPanel');
    } catch (e) {
        console.error("Error creando sesión: ", e);
        alert("Error al conectar con Firebase. Revisa tu configuración.");
    }
};

document.getElementById('btn-activate-buzzer').onclick = async () => {
    if (!currentSessionId) return;
    const sessionRef = doc(db, "sessions", currentSessionId);
    await updateDoc(sessionRef, {
        active: true,
        winner: null
    });
};

document.getElementById('btn-reset-buzzer').onclick = async () => {
    if (!currentSessionId) return;
    const sessionRef = doc(db, "sessions", currentSessionId);
    await updateDoc(sessionRef, {
        active: false,
        winner: null
    });
};

// --- LÓGICA DEL ALUMNO ---

document.getElementById('btn-join-session').onclick = async () => {
    const name = document.getElementById('input-student-name').value;
    const code = document.getElementById('input-join-code').value;

    if (!name || code.length !== 4) {
        alert("Introduce tu nombre y el código de 4 dígitos.");
        return;
    }

    try {
        const sessionRef = doc(db, "sessions", code);
        
        await runTransaction(db, async (transaction) => {
            const sessionSnap = await transaction.get(sessionRef);
            if (!sessionSnap.exists()) {
                throw "SESSION_NOT_FOUND";
            }

            const data = sessionSnap.data();
            const currentCount = data.studentCount || 0;

            if (currentCount >= data.maxStudents) {
                throw "SESSION_FULL";
            }

            // Incrementamos el contador de alumnos
            transaction.update(sessionRef, {
                studentCount: currentCount + 1
            });

            // Guardamos info para el UI
            document.getElementById('student-display-class').innerText = data.className;
        });

        currentSessionId = code;
        currentStudentName = name;
        isTeacher = false;

        document.getElementById('student-display-name').innerText = name;

        startRealtimeListener(code);
        showScreen('studentBuzzer');
    } catch (e) {
        if (e === "SESSION_NOT_FOUND") {
            alert("La clase no existe. Revisa el código.");
        } else if (e === "SESSION_FULL") {
            alert("La clase está llena.");
        } else {
            console.error("Error al unirse: ", e);
            alert("Error al conectar. Verifica tu configuración de Firebase.");
        }
    }
};

document.getElementById('buzzer-button').onclick = async () => {
    if (!currentSessionId || isTeacher) return;

    const sessionRef = doc(db, "sessions", currentSessionId);

    try {
        // Usamos una TRANSACCIÓN para asegurar que solo el primero gana
        await runTransaction(db, async (transaction) => {
            const sessionDoc = await transaction.get(sessionRef);
            if (!sessionDoc.exists()) return;

            const data = sessionDoc.data();
            
            // Solo si el pulsador está activo y no hay ganador todavía
            if (data.active && !data.winner) {
                transaction.update(sessionRef, {
                    winner: {
                        name: currentStudentName,
                        timestamp: serverTimestamp()
                    },
                    active: false // Desactivamos el pulsador tras el primer hit
                });
            }
        });
    } catch (e) {
        console.error("Error en el pulsador: ", e);
    }
};

// --- ESCUCHA EN TIEMPO REAL ---

function startRealtimeListener(sessionId) {
    const sessionRef = doc(db, "sessions", sessionId);

    onSnapshot(sessionRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        if (isTeacher) {
            updateTeacherUI(data);
        } else {
            updateStudentUI(data);
        }
    });
}

function updateTeacherUI(data) {
    const statusBadge = document.getElementById('teacher-status-badge');
    const winnerDisplay = document.getElementById('winner-display');
    const btnActivate = document.getElementById('btn-activate-buzzer');

    if (data.active) {
        statusBadge.innerText = "¡PULSADOR ACTIVO!";
        statusBadge.className = "status-badge status-active";
        btnActivate.disabled = true;
    } else {
        statusBadge.innerText = data.winner ? "RONDA TERMINADA" : "ESPERANDO...";
        statusBadge.className = data.winner ? "status-badge status-active" : "status-badge status-waiting";
        btnActivate.disabled = false;
    }

    if (data.winner) {
        winnerDisplay.classList.remove('hidden');
        document.getElementById('winner-name').innerText = data.winner.name;
    } else {
        winnerDisplay.classList.add('hidden');
    }
}

function updateStudentUI(data) {
    const buzzerBtn = document.getElementById('buzzer-button');
    const statusBadge = document.getElementById('student-status-badge');
    const winnerMsg = document.getElementById('student-winner-msg');

    // Habilitar pulsador si la ronda está activa
    buzzerBtn.disabled = !data.active;

    if (data.active) {
        statusBadge.innerText = "¡DALE YA!";
        statusBadge.className = "status-badge status-active";
    } else {
        statusBadge.innerText = "Esperando al profesor...";
        statusBadge.className = "status-badge status-waiting";
    }

    // Mostrar ganador si existe
    if (data.winner) {
        winnerMsg.classList.remove('hidden');
        document.getElementById('student-winner-name').innerText = data.winner.name;
        
        // Efecto visual si tú eres el ganador
        if (data.winner.name === currentStudentName) {
            document.getElementById('student-winner-name').style.color = "#10b981";
        } else {
            document.getElementById('student-winner-name').style.color = "#f87171";
        }
    } else {
        winnerMsg.classList.add('hidden');
    }
}
