import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc,
    getDocs,
    onSnapshot, 
    collection,
    writeBatch,
    serverTimestamp,
    query,
    where 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentSessionId = null;
let isLocked = false;
let lastWinnerName = null;

const screens = {
    create: document.getElementById('screen-create-session'),
    panel: document.getElementById('screen-teacher-panel')
};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

// Limpiar sesiones antiguas (más de 1 semana)
async function cleanupOldSessions() {
    try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const q = query(collection(db, "sessions"), where("createdAt", "<", oneWeekAgo));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return;

        const batch = writeBatch(db);
        snapshot.forEach((sessionDoc) => {
            batch.delete(sessionDoc.ref);
        });
        
        await batch.commit();
        console.log(`Se han limpiado ${snapshot.size} sesiones antiguas.`);
    } catch (e) {
        console.error("Error al limpiar sesiones antiguas:", e);
    }
}

// Crear Sesión
document.getElementById('btn-create-session').onclick = async () => {
    const className = document.getElementById('input-class-name').value;
    const code = document.getElementById('input-class-code').value;
    const maxStudents = parseInt(document.getElementById('input-max-students').value);

    if (!className || code.length !== 4) {
        alert("Por favor, rellena los datos correctamente (PIN de 4 dígitos).");
        return;
    }

    try {
        // Limpieza automática al crear nueva sesión
        await cleanupOldSessions();

        const sessionId = code; 
        const sessionRef = doc(db, "sessions", sessionId);

        await setDoc(sessionRef, {
            className,
            code,
            maxStudents,
            studentCount: 0,
            active: false,
            locked: false,
            winner: null,
            createdAt: serverTimestamp()
        });

        currentSessionId = sessionId;
        document.getElementById('display-class-name').innerText = className;
        document.getElementById('display-class-code').innerText = code;
        
        startRealtimeListener(sessionId);
        startStudentsListener(sessionId);
        showScreen('panel');
    } catch (e) {
        console.error("Error: ", e);
        alert("Error al conectar con Firebase.");
    }
};

// Control de Pulsador
document.getElementById('btn-activate-buzzer').onclick = async () => {
    if (!currentSessionId) return;
    await updateDoc(doc(db, "sessions", currentSessionId), {
        active: true,
        winner: null
    });
};

document.getElementById('btn-reset-buzzer').onclick = async () => {
    if (!currentSessionId) return;
    await updateDoc(doc(db, "sessions", currentSessionId), {
        active: false,
        winner: null
    });
};

// Control de Bloqueo
document.getElementById('btn-lock-session').onclick = async () => {
    if (!currentSessionId) return;
    isLocked = !isLocked;
    await updateDoc(doc(db, "sessions", currentSessionId), {
        locked: isLocked
    });
};

// Vaciar Clase
document.getElementById('btn-clear-session').onclick = async () => {
    if (!currentSessionId || !confirm("¿Seguro que quieres expulsar a TODOS los alumnos?")) return;
    
    const studentsRef = collection(db, "sessions", currentSessionId, "students");
    const snapshot = await getDocs(studentsRef);
    
    const batch = writeBatch(db);
    snapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });
    
    await batch.commit();
    await updateDoc(doc(db, "sessions", currentSessionId), { studentCount: 0 });
};

// Penalizar Ganador
document.getElementById('btn-penalize-winner').onclick = async () => {
    if (!currentSessionId || !lastWinnerName) return;
    
    const studentRef = doc(db, "sessions", currentSessionId, "students", lastWinnerName);
    await updateDoc(studentRef, { penalty: true });
    alert(`Alumno ${lastWinnerName} penalizado para la siguiente ronda ⚡`);
};

// Control de Ayuda
document.querySelectorAll('.help-btn-trigger').forEach(btn => {
    btn.onclick = () => {
        document.getElementById('modal-help').classList.remove('hidden');
    };
});

document.getElementById('btn-close-help').onclick = () => {
    document.getElementById('modal-help').classList.add('hidden');
};

function startRealtimeListener(sessionId) {
    onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        isLocked = data.locked;
        lastWinnerName = data.winner ? data.winner.name : null;
        updateUI(data);
    });
}

function startStudentsListener(sessionId) {
    const studentsRef = collection(db, "sessions", sessionId, "students");
    onSnapshot(studentsRef, (querySnapshot) => {
        const studentList = document.getElementById('student-list');
        const studentCount = document.getElementById('student-count');
        
        studentList.innerHTML = "";
        studentCount.innerText = querySnapshot.size;

        if (querySnapshot.empty) {
            studentList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">Esperando alumnos...</span>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const student = docSnap.data();
            const badge = document.createElement('span');
            badge.className = "status-badge";
            badge.style.cssText = `
                background: rgba(255,255,255,0.1); 
                font-size: 0.75rem; 
                display: flex; 
                align-items: center; 
                gap: 0.5rem;
                padding-right: 0.5rem;
                ${student.penalty ? 'border: 1px solid #f59e0b;' : ''}
            `;
            
            badge.innerHTML = `
                <span>${student.penalty ? '<span class="penalty-tag">⚡</span>' : ''}${student.name}</span>
                <div class="kick-btn" title="Expulsar">×</div>
            `;

            badge.querySelector('.kick-btn').onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`¿Expulsar a ${student.name}?`)) {
                    await deleteDoc(doc(db, "sessions", sessionId, "students", student.name));
                }
            };

            studentList.appendChild(badge);
        });
    });
}

function updateUI(data) {
    const statusBadge = document.getElementById('teacher-status-badge');
    const winnerDisplay = document.getElementById('winner-display');
    const btnActivate = document.getElementById('btn-activate-buzzer');
    const btnLock = document.getElementById('btn-lock-session');

    if (data.locked) {
        btnLock.innerText = "ABRIR";
        btnLock.style.background = "var(--danger)";
    } else {
        btnLock.innerText = "CERRAR";
        btnLock.style.background = "transparent";
        btnLock.style.color = "var(--text-light)";
    }

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
