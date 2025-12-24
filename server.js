import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const FILE_NAME = fileURLToPath(import.meta.url);
const DIR_NAME = path.dirname(FILE_NAME);

const PUBLIC_DIR = path.join(DIR_NAME, 'public');
const PORT = process.env.PORT || 3000;

const fastify = Fastify();

fastify.register(fastifyStatic, { root: PUBLIC_DIR });

fastify.get('/', (req, reply) => {
  reply.sendFile('index.html');
});

fastify.get('/mobile', (req, reply) => {
  reply.sendFile('mobile.html');
});

//

const pairs = new Map();

fastify.register(websocket);

fastify.register(async (fastify) => {
  fastify.get('/ws_max', { websocket: true }, (socket, req) => {
    const id = req.query.id || generateID();

    if (pairs.has(id)) {
      console.log(`${id} already in use`);
      socket.close(1000, `${id} already in use`);
      return;
    }

    socket.id = id;
    pairs.set(socket.id, { max: socket, mobile: null });
    socket.send(socket.id);

    socket.on('close', () => {
      // kick off the mobile device and delete the pairs entry
      const mobileSocket = pairs.get(socket.id).mobile;
      console.log(`Max client ${socket.id} has disconnected.`);
      mobileSocket?.close(1000, `Max client ${socket.id} has disconnected.`);
      pairs.delete(socket.id);
      return;
    });
  });
});

fastify.register(async (fastify) => {
  fastify.get('/ws_mobile', { websocket: true }, (socket, req) => {
    const id = req.query.id;

    if (!pairs.has(id)) {
      console.log(`No Max client ${id}`);
      socket.close(1000, `No Max client ${id}`);
      return;
    }
    if (pairs.get(id).mobile) {
      console.log(`Max client ${id} already paired with mobile device.`);
      socket.close(1000, `Max client ${id} already paired with mobile device.`);
      return;
    }

    socket.id = id;
    pairs.get(socket.id).mobile = socket;
    socket.send(socket.id);

    socket.on('message', (message) => {
      const maxSocket = pairs.get(socket.id).max;
      //const payload = JSON.parse(message);
      maxSocket.send(message.toString());
    });
    socket.on('close', () => {
      // remove the mobile device entry
      console.log(`Mobile device ${socket.id} disconnected.`);
      if (pairs.get(socket.id)) pairs.get(socket.id).mobile = null;
    });
  });
});

//

const startServer = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

startServer();

//

function generateID() {
  return randomBytes(6).toString('base64url');
}
