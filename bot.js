const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const OpenAI = require('openai')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Apex Designs', 'Chrome', '1.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log('Scan this QR with WhatsApp:')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode!== DisconnectReason.loggedOut
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('✅ Apex Designs Bot Connected!')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        if (!text) return

        const from = msg.key.remoteJid

        try {
            await sock.sendPresenceUpdate('composing', from)

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are Apex Designs AI assistant. You help with business, branding, and design. Be helpful, short, and friendly. You are created by Apex Designs Kenya.' },
                    { role: 'user', content: text }
                ]
            })

            const reply = completion.choices[0].message.content
            await sock.sendMessage(from, { text: reply })

        } catch (e) {
            console.log('Error:', e.message)
            await sock.sendMessage(from, { text: 'Sorry, I had an error. Try again.' })
        }
    })
}

startBot()
