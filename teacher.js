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
const unfocusedTracker = new Map(); // Seguimiento de alumnos distraídos (nombre -> timestamp)

window.onerror = (msg, url, line, col, error) => {
    alert(`Error Global (Profesor): ${msg}\nEn ${url}:${line}`);
    return false;
};

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
        // Limpieza automática en segundo plano para no bloquear
        cleanupOldSessions(); 

        const sessionId = code; 
        const sessionRef = doc(db, "sessions", sessionId);

        // Limpiar alumnos previos para evitar "fantasmas" de otras sesiones
        const studentsRef = collection(db, "sessions", sessionId, "students");
        const studentsSnap = await getDocs(studentsRef);
        if (!studentsSnap.empty) {
            const batch = writeBatch(db);
            studentsSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

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
        winner: null,
        countdown: null
    });
};

// Modo Sorpresa (Cuenta atrás)
document.getElementById('btn-surprise-mode').onclick = async () => {
    if (!currentSessionId) return;
    
    let count = 5;
    const sessionRef = doc(db, "sessions", currentSessionId);
    
    // Bloqueo inmediato de botones
    document.getElementById('btn-surprise-mode').disabled = true;
    document.getElementById('btn-activate-buzzer').disabled = true;

    const interval = setInterval(async () => {
        if (count > 0) {
            await updateDoc(sessionRef, { countdown: count });
            count--;
        } else {
            clearInterval(interval);
            await updateDoc(sessionRef, { 
                active: true, 
                winner: null, 
                countdown: null 
            });
        }
    }, 1000);
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

// Botón No Vagos Toggle
document.getElementById('btn-vagos-toggle').onclick = (e) => {
    e.target.classList.toggle('btn-vagos-active');
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

        const now = Date.now();
        let activeCount = 0;

        querySnapshot.forEach((docSnap) => {
            const student = docSnap.data();
            
            // FILTRO DE PRESENCIA: Solo mostrar si se ha visto en los últimos 60 segundos
            const lastSeen = student.lastSeen ? student.lastSeen.toMillis() : 0;
            if (now - lastSeen > 60000) {
                unfocusedTracker.delete(student.name);
                return; 
            }

            // LÓGICA DE AUTO-EXPULSIÓN POR DISTRACCIÓN
            if (student.focused === false) {
                if (!unfocusedTracker.has(student.name)) {
                    unfocusedTracker.set(student.name, now);
                } else {
                    const distractedTime = now - unfocusedTracker.get(student.name);
                    const autoKickEnabled = document.getElementById('btn-vagos-toggle').classList.contains('btn-vagos-active');
                    if (autoKickEnabled && distractedTime > 60000) {
                        console.log(`Auto-expulsando a ${student.name} por distracción (${Math.round(distractedTime/1000)}s)`);
                        deleteDoc(doc(db, "sessions", sessionId, "students", student.name));
                        unfocusedTracker.delete(student.name);
                        return; 
                    }
                }
            } else {
                unfocusedTracker.delete(student.name);
            }

            activeCount++;
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
                <div style="width: 6px; height: 6px; border-radius: 50%; background: ${student.focused !== false ? '#10b981' : '#f59e0b'}; transition: background 0.3s;"></div>
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
        
        studentCount.innerText = activeCount;

        if (activeCount === 0) {
            studentList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">Esperando alumnos...</span>';
        }
    });
}

function updateUI(data) {
    const statusBadge = document.getElementById('teacher-status-badge');
    const winnerDisplay = document.getElementById('winner-display');
    const activationControls = document.getElementById('activation-controls');
    const btnReset = document.getElementById('btn-reset-buzzer');
    const btnLock = document.getElementById('btn-lock-session');

    if (data.locked) {
        btnLock.innerText = "ABRIR";
        btnLock.style.background = "var(--danger)";
    } else {
        btnLock.innerText = "CERRAR";
        btnLock.style.background = "transparent";
        btnLock.style.color = "var(--text-light)";
    }

    const inProgress = data.active || (data.countdown && data.countdown > 0) || data.winner;

    if (inProgress) {
        statusBadge.innerText = data.active ? "¡PULSADOR ACTIVO!" : 
                                (data.countdown > 0 ? `PREPARANDO... (${data.countdown})` : "RONDA TERMINADA");
        statusBadge.className = "status-badge status-active";
        activationControls.classList.add('hidden');
        btnReset.classList.remove('hidden');
    } else {
        statusBadge.innerText = "ESPERANDO...";
        statusBadge.className = "status-badge status-waiting";
        activationControls.classList.remove('hidden');
        btnReset.classList.add('hidden');
        
        // Asegurar que los botones estén habilitados al volver de una cuenta atrás
        document.getElementById('btn-activate-buzzer').disabled = false;
        document.getElementById('btn-surprise-mode').disabled = false;
    }

    if (data.winner) {
        winnerDisplay.classList.remove('hidden');
        document.getElementById('winner-name').innerText = data.winner.name;
    } else {
        winnerDisplay.classList.add('hidden');
    }
}
