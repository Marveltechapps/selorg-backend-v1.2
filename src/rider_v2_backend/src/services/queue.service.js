 "use strict";
 
 /**
  * Clean, modern JavaScript implementation of the queue service.
  * Supports RabbitMQ (amqplib), Redis (ioredis) and an in-memory fallback.
  */
 const amqplib = require("amqplib");
 const { getRedisClient } = require("../config/redis.js");
 
 class QueueService {
   constructor() {
     this.rabbitmqConnection = null;
     this.rabbitmqChannel = null;
     this.redisClient = getRedisClient();
     this.useRabbitMQ = false;
     this._inMemoryQueues = new Map();
 
     // Ping redis to detect availability; fall back to in-memory queue on error.
     try {
       if (this.redisClient && typeof this.redisClient.ping === "function") {
         this.redisClient.ping().catch((err) => {
           console.warn(
             "[Queue] Redis ping failed, falling back to in-memory queue:",
             err && err.message ? err.message : err
           );
           try {
             if (this.redisClient && typeof this.redisClient.quit === "function") {
               this.redisClient.quit().catch(() => {});
             }
           } catch (e) {}
           this.redisClient = null;
         });
       }
     } catch (e) {
       console.warn("[Queue] Redis init failed, using in-memory queue:", e && e.message ? e.message : e);
       this.redisClient = null;
     }
   }
 
   // Try to connect to RabbitMQ (if RABBITMQ_URL provided); otherwise use Redis.
   async initialize() {
     const rabbitmqUrl = process.env.RABBITMQ_URL;
     if (rabbitmqUrl) {
       try {
         this.rabbitmqConnection = await amqplib.connect(rabbitmqUrl);
         this.rabbitmqChannel = await this.rabbitmqConnection.createChannel();
         this.useRabbitMQ = true;
         console.log("✅ RabbitMQ connected");
       } catch (err) {
         console.warn("[Queue] RabbitMQ connection failed, falling back to Redis:", err);
         this.useRabbitMQ = false;
       }
     } else {
       console.log("[Queue] Using Redis for message queue");
       this.useRabbitMQ = false;
     }
   }
 
   async publish(queueName, message, options) {
     if (this.useRabbitMQ && this.rabbitmqChannel) {
       return this.publishToRabbitMQ(queueName, message, options);
     }
     return this.publishToRedis(queueName, message, options);
   }
 
   async consume(queueName, handler, options) {
     if (this.useRabbitMQ && this.rabbitmqChannel) {
       return this.consumeFromRabbitMQ(queueName, handler, options);
     }
     return this.consumeFromRedis(queueName, handler);
   }
 
   async publishToRabbitMQ(queueName, message, options = {}) {
     if (!this.rabbitmqChannel) throw new Error("RabbitMQ channel not initialized");
     try {
       await this.rabbitmqChannel.assertQueue(queueName, { durable: options.durable ?? true });
       const sent = this.rabbitmqChannel.sendToQueue(
         queueName,
         Buffer.from(JSON.stringify(message)),
         { persistent: options.persistent ?? true, priority: options.priority }
       );
       return sent;
     } catch (err) {
       console.error(`[Queue] Error publishing to RabbitMQ queue ${queueName}:`, err);
       return false;
     }
   }
 
   async publishToRedis(queueName, message, options = {}) {
     const key = `queue:${queueName}`;
     const serialized = JSON.stringify(message);
     // If Redis unavailable, use in-memory queue
     if (!this.redisClient) {
       try {
         let existing = this._inMemoryQueues.get(queueName);
         if (!existing) {
           existing = { items: [], delayed: [], consumerStarted: false };
           this._inMemoryQueues.set(queueName, existing);
         }
         if (options.delay) {
           const deliverAt = Date.now() + options.delay;
           existing.delayed.push({ deliverAt, payload: serialized });
         } else {
           existing.items.unshift(serialized);
         }
         return true;
       } catch (e) {
         console.error("[Queue] In-memory publish failed:", e);
         return false;
       }
     }
 
     try {
       if (options.delay) {
         const score = Date.now() + options.delay;
         await this.redisClient.zadd(`queue:${queueName}:delayed`, score, serialized);
       } else {
         await this.redisClient.lpush(key, serialized);
       }
       return true;
     } catch (err) {
       console.error(`[Queue] Error publishing to Redis queue ${queueName}:`, err);
       return false;
     }
   }
 
   async consumeFromRabbitMQ(queueName, handler, options = {}) {
     if (!this.rabbitmqChannel) throw new Error("RabbitMQ channel not initialized");
     await this.rabbitmqChannel.assertQueue(queueName, { durable: true });
     if (options.prefetch) {
       await this.rabbitmqChannel.prefetch(options.prefetch);
     }
     await this.rabbitmqChannel.consume(queueName, async (msg) => {
       if (!msg) return;
       try {
         const message = JSON.parse(msg.content.toString());
         await handler(message);
         this.rabbitmqChannel?.ack(msg);
       } catch (err) {
         console.error(`[Queue] Error processing message from ${queueName}:`, err);
         this.rabbitmqChannel?.nack(msg, false, true);
       }
     });
     console.log(`[Queue] Consuming from RabbitMQ queue: ${queueName}`);
   }
 
   async consumeFromRedis(queueName, handler) {
     const key = `queue:${queueName}`;

     // If Redis not available, use in-memory consumer
     if (!this.redisClient) {
       let existingQ = this._inMemoryQueues.get(queueName);
       if (existingQ && existingQ.consumerStarted) {
         console.log(`[Queue] In-memory consumer already started for: ${queueName}`);
         return;
       }
       if (!existingQ) {
         existingQ = { items: [], delayed: [], consumerStarted: true };
         this._inMemoryQueues.set(queueName, existingQ);
       } else {
         existingQ.consumerStarted = true;
       }

       // Move delayed -> items periodically
       setInterval(() => {
         try {
           const now = Date.now();
           const q = this._inMemoryQueues.get(queueName);
           if (!q) return;
           const ready = q.delayed.filter((d) => d.deliverAt <= now);
           if (ready.length > 0) {
             q.delayed = q.delayed.filter((d) => d.deliverAt > now);
             for (let i = 0; i < ready.length; i++) q.items.unshift(ready[i].payload);
           }
         } catch (err) {
           console.error("[Queue] In-memory delayed processing error:", err);
         }
       }, 1000);

       // Consume loop
       (function consumeLoop(self = this) {
         try {
           const q = self._inMemoryQueues.get(queueName);
           if (q && q.items.length > 0) {
             const messageStr = q.items.pop();
             const message = JSON.parse(messageStr);
             handler(message).catch((err) => {
               console.error("[Queue] In-memory handler error:", err);
             });
           }
         } catch (err) {
           console.error("[Queue] In-memory consume error:", err);
         } finally {
           setTimeout(() => consumeLoop(self), 50);
         }
       })(this);

       console.log(`[Queue] Consuming from in-memory queue: ${queueName}`);
       return;
     }

     // Redis-backed consumer
     // Periodically move delayed -> list
     setInterval(async () => {
       try {
         const now = Date.now();
         const delayedKey = `queue:${queueName}:delayed`;
         const messages = await this.redisClient.zrangebyscore(delayedKey, 0, now, "LIMIT", 0, 10);
         for (const messageStr of messages) {
           await this.redisClient.zrem(delayedKey, messageStr);
           await this.redisClient.lpush(key, messageStr);
         }
       } catch (err) {
         console.error("[Queue] Error processing delayed messages:", err);
       }
     }, 1000);

     // Consume loop using BRPOP with short timeout
     const consumeLoop = async () => {
       try {
         const messageArr = await this.redisClient.brpop(key, 5);
         if (messageArr && messageArr.length >= 2) {
           const message = JSON.parse(messageArr[1]);
           try {
             await handler(message);
           } catch (err) {
             console.error("[Queue] Error processing message:", err);
             message.retryCount = (message.retryCount || 0) + 1;
             if (message.retryCount < 3) {
               await this.redisClient.lpush(key, JSON.stringify(message));
             }
           }
         }
       } catch (err) {
         console.error(`[Queue] Error consuming from Redis queue ${queueName}:`, err);
       } finally {
         // schedule next iteration
         setImmediate(consumeLoop);
       }
     };
     consumeLoop();
     console.log(`[Queue] Consuming from Redis queue: ${queueName}`);
   }

   async getQueueLength(queueName) {
     if (this.useRabbitMQ && this.rabbitmqChannel) {
       const queue = await this.rabbitmqChannel.checkQueue(queueName);
       return queue.messageCount;
     }
     if (!this.redisClient) {
       const q = this._inMemoryQueues.get(queueName);
       return q ? q.items.length : 0;
     }
     return this.redisClient.llen(`queue:${queueName}`);
   }

   async purgeQueue(queueName) {
     if (this.useRabbitMQ && this.rabbitmqChannel) {
       await this.rabbitmqChannel.purgeQueue(queueName);
       return;
     }
     if (!this.redisClient) {
       const q = this._inMemoryQueues.get(queueName);
       if (q) {
         q.items = [];
         q.delayed = [];
       }
       return;
     }
     await this.redisClient.del(`queue:${queueName}`);
     await this.redisClient.del(`queue:${queueName}:delayed`);
   }

   async shutdown() {
     if (this.rabbitmqChannel) {
       await this.rabbitmqChannel.close();
       this.rabbitmqChannel = null;
     }
     if (this.rabbitmqConnection) {
       await this.rabbitmqConnection.close();
       this.rabbitmqConnection = null;
     }
     console.log("✅ Queue service shut down");
   }
 }

 // Export singleton instance
 exports.QueueService = QueueService;
 exports.queueService = new QueueService();

