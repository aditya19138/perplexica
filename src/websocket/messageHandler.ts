import { EventEmitter, WebSocket } from 'ws';
import { BaseMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import logger from '../utils/logger';
import db from '../db';
import { chats, messages as messagesSchema } from '../db/schema';
import { eq, asc, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { getFileDetails } from '../utils/files';
import MetaSearchAgent, {
  MetaSearchAgentType,
} from '../search/metaSearchAgent';
import prompts from '../prompts';
import { loadAnalyticsModel, AnalyticsModel } from '../lib/providers/analytics';
import eventEmitter from 'events';
import path from 'path';
import fs from 'fs';
import { getPort } from '../config';

type Message = {
  messageId: string;
  chatId: string;
  content: string;
};

type WSMessage = {
  message: Message;
  analyticsModel: boolean,
  optimizationMode: 'speed' | 'balanced' | 'quality';
  type: string;
  focusMode: string;
  history: Array<[string, string]>;
  files: Array<string>;
};

export const searchHandlers = {
  webSearch: new MetaSearchAgent({
    activeEngines: [],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
    summarizer: true,
  }),
  academicSearch: new MetaSearchAgent({
    activeEngines: ['arxiv', 'google scholar', 'pubmed'],
    queryGeneratorPrompt: prompts.academicSearchRetrieverPrompt,
    responsePrompt: prompts.academicSearchResponsePrompt,
    rerank: true,
    rerankThreshold: 0,
    searchWeb: true,
    summarizer: false,
  }),
  writingAssistant: new MetaSearchAgent({
    activeEngines: [],
    queryGeneratorPrompt: '',
    responsePrompt: prompts.writingAssistantPrompt,
    rerank: true,
    rerankThreshold: 0,
    searchWeb: false,
    summarizer: false,
  }),
  wolframAlphaSearch: new MetaSearchAgent({
    activeEngines: ['wolframalpha'],
    queryGeneratorPrompt: prompts.wolframAlphaSearchRetrieverPrompt,
    responsePrompt: prompts.wolframAlphaSearchResponsePrompt,
    rerank: false,
    rerankThreshold: 0,
    searchWeb: true,
    summarizer: false,
  }),
  youtubeSearch: new MetaSearchAgent({
    activeEngines: ['youtube'],
    queryGeneratorPrompt: prompts.youtubeSearchRetrieverPrompt,
    responsePrompt: prompts.youtubeSearchResponsePrompt,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
    summarizer: false,
  }),
  redditSearch: new MetaSearchAgent({
    activeEngines: ['reddit'],
    queryGeneratorPrompt: prompts.redditSearchRetrieverPrompt,
    responsePrompt: prompts.redditSearchResponsePrompt,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
    summarizer: false,
  }),
};

const handleEmitterEvents = (
  emitter: EventEmitter,
  ws: WebSocket,
  messageId: string,
  chatId: string,
) => {
  let recievedMessage = '';
  let sources = [];

  emitter.on('data', (data) => {
    // console.log("----------------EVENT DETECTED---------------, data -> ", data);
    const parsedData = JSON.parse(data);
    if (parsedData.type === 'response') {
      ws.send(
        JSON.stringify({
          type: 'message',
          data: parsedData.data,
          messageId: messageId,
        }),
      );
      recievedMessage += parsedData.data;
    } else if (parsedData.type === 'sources') {
      ws.send(
        JSON.stringify({
          type: 'sources',
          data: parsedData.data,
          messageId: messageId,
        }),
      );
      sources = parsedData.data;
    }
  });
  emitter.on('end', () => {
    ws.send(JSON.stringify({ type: 'messageEnd', messageId: messageId }));
    try {
      db.insert(messagesSchema)
        .values({
          content: recievedMessage,
          chatId: chatId,
          messageId: messageId,
          role: 'assistant',
          metadata: JSON.stringify({
            createdAt: new Date(),
            ...(sources && sources.length > 0 && { sources }),
          }),
        })
        .execute();
    } catch (error) {
      console.log("DB Error : ", error);
    }
  });
  emitter.on('error', (data) => {
    const parsedData = JSON.parse(data);
    ws.send(
      JSON.stringify({
        type: 'error',
        data: parsedData.data,
        key: 'CHAIN_ERROR',
      }),
    );
  });
};

export const handleMessage = async (
  message: string,
  ws: WebSocket,
  llm: BaseChatModel,
  embeddings: Embeddings,
) => {
  try {
    const parsedWSMessage = JSON.parse(message) as WSMessage;
    console.log("-------------------parsedWSMessage---------------");
    console.log(parsedWSMessage);
    const analyticsModel = parsedWSMessage.analyticsModel;
    const parsedMessage = parsedWSMessage.message;

    if (parsedWSMessage.files.length > 0) {
      /* TODO: Implement uploads in other classes/single meta class system*/
      parsedWSMessage.focusMode = 'webSearch';
    }

    const humanMessageId =
      parsedMessage.messageId ?? crypto.randomBytes(7).toString('hex');
    const aiMessageId = crypto.randomBytes(7).toString('hex');

    if (!parsedMessage.content)
      return ws.send(
        JSON.stringify({
          type: 'error',
          data: 'Invalid message format',
          key: 'INVALID_FORMAT',
        }),
      );

    const history: BaseMessage[] = parsedWSMessage.history.map((msg) => {
      if (msg[0] === 'human') {
        return new HumanMessage({
          content: msg[1],
        });
      } else {
        return new AIMessage({
          content: msg[1],
        });
      }
    });

    if (!analyticsModel) {      // text model 
      if (parsedWSMessage.type === 'message') {
        const handler: MetaSearchAgentType =
          searchHandlers[parsedWSMessage.focusMode];

        if (handler) {
          try {
            const emitter = await handler.searchAndAnswer(
              parsedMessage.content,
              history,
              llm,
              embeddings,
              parsedWSMessage.optimizationMode,
              parsedWSMessage.files,
            );

            handleEmitterEvents(emitter, ws, aiMessageId, parsedMessage.chatId);

            const chat = await db.query.chats.findFirst({
              where: eq(chats.id, parsedMessage.chatId),
            });

            if (!chat) {
              await db
                .insert(chats)
                .values({
                  id: parsedMessage.chatId,
                  title: parsedMessage.content,
                  createdAt: new Date().toString(),
                  focusMode: parsedWSMessage.focusMode,
                  files: parsedWSMessage.files.map(getFileDetails),
                })
                .execute();
            }

            const messageExists = await db.query.messages.findFirst({
              where: eq(messagesSchema.messageId, humanMessageId),
            });

            if (!messageExists) {
              await db
                .insert(messagesSchema)
                .values({
                  content: parsedMessage.content,
                  chatId: parsedMessage.chatId,
                  messageId: humanMessageId,
                  role: 'user',
                  metadata: JSON.stringify({
                    createdAt: new Date(),
                  }),
                })
                .execute();
            } else {
              await db
                .delete(messagesSchema)
                .where(gt(messagesSchema.id, messageExists.id))
                .execute();
            }
          } catch (err) {
            console.log(err);
          }
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              data: 'Invalid focus mode',
              key: 'INVALID_FOCUS_MODE',
            }),
          );
        }
      }
    }
    else {      // analytics model
      console.log("-----------------ANALYTICS MODEL START-----------------------------");
      const chat_models = await loadAnalyticsModel();
      const model = chat_models['analytics'].model;

      const stream = await model.stream([parsedMessage.content])

      // const emitter = new eventEmitter();

      for await (const chunk of stream) {
        // console.log("chunk ->", chunk.content);
        // emitter.emit('data', JSON.stringify({ type: 'response', data: chunk.content }));
        ws.send(
          JSON.stringify({
            type: 'message',
            data: chunk.content,
            messageId: aiMessageId,
          })
        );
      }

      ws.send(JSON.stringify({ type: 'stream_end', data: "", messageId: aiMessageId }));



      const chat = await db.query.chats.findFirst({
        where: eq(chats.id, parsedMessage.chatId),
      });


      // saving chats and messages
      if (!chat) {
        await db
          .insert(chats)
          .values({
            id: parsedMessage.chatId,
            title: parsedMessage.content,
            createdAt: new Date().toString(),
            focusMode: parsedWSMessage.focusMode,
            files: parsedWSMessage.files.map(getFileDetails),
          })
          .execute();
      }

      const messageExists = await db.query.messages.findFirst({
        where: eq(messagesSchema.messageId, humanMessageId),
      });

      if (!messageExists) {
        await db
          .insert(messagesSchema)
          .values({
            content: parsedMessage.content,
            chatId: parsedMessage.chatId,
            messageId: humanMessageId,
            role: 'user',
            metadata: JSON.stringify({
              createdAt: new Date(),
            }),
          })
          .execute();
      } else {
        await db
          .delete(messagesSchema)
          .where(gt(messagesSchema.id, messageExists.id))
          .execute();
      }

      await sendHtml(ws, model, aiMessageId, parsedMessage.chatId); // sending html data to frontend
    }
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: 'error',
        data: 'Invalid message format',
        key: 'INVALID_FORMAT',
      }),
    );
    logger.error(`Failed to handle message: ${err}`);
  }
};


const sendHtml = async (
  ws: WebSocket,
  model: AnalyticsModel,
  aiMessageId: string,
  chatId: string
) => {

  const promise = model._get_promise();
  var html_byte_strings: [];
  const htmlFilesDir = path.resolve(__dirname, '../html_files');
  // Call the function before adding new files
  clearDirectory(htmlFilesDir);

  const port = getPort();
  var summary: string;

  await promise.then((response) => {
    console.log("-------------ANALYTIC MODEL API DONE---------------- len(html_strings) ->", response.data['html_byte_strings'].length);
    html_byte_strings = response.data['html_byte_strings'];
    summary = response.data['result'];
    console.log("---------summary-------->", summary);

    html_byte_strings.forEach((byteString, index) => {
      const filePath = path.join(htmlFilesDir, `file_${index + 1}.html`);
      fs.writeFileSync(filePath, byteString, 'utf-8');
    });

    const files = fs.readdirSync(htmlFilesDir); // Read all files in the directory

    const fileUrls = files.map((file, index) => ({
      name: `chart${index + 1}`,
      link: `http://localhost:${port}/html_files/${file}`
    }));

    console.log("-------------------fileUrls-----------")
    console.log(fileUrls);

    // Convert to markdown format as a single string
    const chartsMarkdown = fileUrls
      .map(file => `[${file.name}](${file.link})`) // Convert each to markdown link
      .join('\n\n'); // Join all links into a single string with newlines

    var final_data = "";
    // send summary
    ws.send(JSON.stringify({ type: 'message', data: `##Summary : \n ${summary}` }));
    final_data += `##Summary : \n ${summary}`;

    // // Send the URLs to the client
    ws.send(JSON.stringify({ type: "message", data: `\n ##Charts: \n ${chartsMarkdown}` }));
    final_data += `\n ##Charts: \n ${chartsMarkdown}`;

    // signalling message end to frontend
    ws.send(JSON.stringify({ type: 'messageEnd', messageId: aiMessageId }));
    try {
      db.insert(messagesSchema)
        .values({
          content: final_data,
          chatId: chatId,
          messageId: aiMessageId,
          role: 'assistant',
          metadata: JSON.stringify({
            createdAt: new Date()
          }),
        })
        .execute();
    } catch (error) {
      console.log("DB Error : ", error);
    }
  })
    .catch((error) => {
      console.log("Error in /analytical_model api ---->", error);
    });

}

const clearDirectory = (directoryPath: string) => {
  try {
    // Check if the directory exists
    if (!fs.existsSync(directoryPath)) {
      console.error(`Directory does not exist: ${directoryPath}`);
      return;
    }

    // Read all files in the directory
    const files = fs.readdirSync(directoryPath);

    // Loop through and delete each file
    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);
      fs.unlinkSync(filePath); // Delete file
    });

    console.log(`All files in ${directoryPath} have been deleted.`);
  } catch (error) {
    console.error(`Error clearing directory ${directoryPath}:`, error);
  }
}

