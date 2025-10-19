import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// --- Konfiguracja Klienta Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Błąd krytyczny: Brak kluczy Supabase w pliku .env. Serwer nie może wystartować.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
export const wss = new WebSocketServer({ noServer: true });

// Przechowuje mapowanie: userId -> Set<WebSocket> (wszystkie aktywne połączenia danego użytkownika)
const userIdToSockets = new Map();

console.log("Serwer WebSocket gotowy do połączeń.");

// --- Logika Połączenia WebSocket ---
wss.on('connection', (ws) => {
    let currentUserId = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Rejestracja użytkownika po połączeniu
            if (data.type === 'join') {
                currentUserId = data.name;
                if (!userIdToSockets.has(currentUserId)) {
                    userIdToSockets.set(currentUserId, new Set());
                }
                userIdToSockets.get(currentUserId).add(ws);
                console.log(`Użytkownik ${currentUserId} połączył się.`);
            }

            // 2. Obsługa nowej wiadomości
            else if (data.type === 'message') {
                const { room: targetRoom, text } = data;
                if (!currentUserId || !targetRoom || !text) {
                    console.warn("Otrzymano niekompletną wiadomość:", data);
                    return;
                }

                // Zapisz wiadomość w bazie danych
                const { data: savedMessage, error } = await supabase
                    .from('messages')
                    .insert({ sender_id: currentUserId, room_id: targetRoom, content: text })
                    .select()
                    .single();

                if (error) throw error;

                const msgObj = {
                    type: 'message',
                    username: savedMessage.sender_id,
                    text: savedMessage.content,
                    inserted_at: savedMessage.created_at,
                    room: savedMessage.room_id,
                };

                const isGroupChat = !targetRoom.includes('_');

                if (isGroupChat) {
                    // Rozgłoś wiadomość do wszystkich członków grupy
                    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', targetRoom);
                    if (members) {
                        console.log(`Rozgłaszanie do grupy ${targetRoom} (${members.length} członków).`);
                        members.forEach(member => broadcastToUser(member.user_id, JSON.stringify(msgObj)));
                    }
                } else {
                    // Rozgłoś wiadomość do dwóch uczestników rozmowy prywatnej
                    const participants = targetRoom.split('_');
                    console.log(`Rozgłaszanie do rozmowy prywatnej ${targetRoom}.`);
                    participants.forEach(participantId => broadcastToUser(participantId, JSON.stringify(msgObj)));
                }
            }

        } catch (err) {
            console.error('Błąd przetwarzania wiadomości WebSocket:', err.message);
        }
    });

    ws.on('close', () => {
        if (currentUserId && userIdToSockets.has(currentUserId)) {
            const userSockets = userIdToSockets.get(currentUserId);
            userSockets.delete(ws);
            if (userSockets.size === 0) {
                userIdToSockets.delete(currentUserId);
                console.log(`Użytkownik ${currentUserId} rozłączył się.`);
            }
        }
    });
});

// --- Funkcje Pomocnicze ---
function broadcastToUser(userId, msg) {
    if (userIdToSockets.has(userId)) {
        for (const clientWs of userIdToSockets.get(userId)) {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msg);
            }
        }
    }
}