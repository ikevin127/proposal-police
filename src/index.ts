import { Probot } from "probot";
import OpenAI from "openai";

// populate process.env with values from .env file otherwise tests will fail
require("dotenv").config("../.env");

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

// For more information on building apps:
// https://probot.github.io/docs/

// To get your app running against GitHub, see:
// https://probot.github.io/docs/development/

export = (app: Probot) => {
  // handle the case when somebody posts a new comment on an issue
  // to determine whether it's a proposal and so if it follows the template
  app.on("issue_comment.created", async (context) => {
    // check if the issue is opened and if the Help Wanted label is present
    if (
      context.payload.issue.state === "open" 
      // && context.payload.issue.labels.find((label) => label.name === "Help Wanted")
    ) {
      if (!process.env.OPENAI_ASSISTANT_ID) {
        console.log('OPENAI_ASSISTANT_ID missing from .env file');
        return;
      }

      // 1, check if comment is proposal and if proposal template is followed
      const content = `I NEED HELP WITH CASE (1.), CHECK IF COMMENT IS PROPOSAL AND IF TEMPLATE IS FOLLOWED AS PER INSTRUCTIONS. IT IS MANDATORY THAT YOU RESPOND ONLY WITH "NO_ACTION" IN CASE THE COMMENT IS NOT A PROPOSAL. Comment content: ${context.payload.comment.body}`;

      // create thread with first user message and run it
      const createAndRunResponse = await openai.beta.threads.createAndRun({
        assistant_id: process.env.OPENAI_ASSISTANT_ID,
        thread: {messages: [{ role: "user", content }],},
      });

      // count calls for debug purposes
      let count = 0;
      // poll for run completion
      const intervalID = setInterval(() => {
        openai.beta.threads.runs.retrieve(createAndRunResponse.thread_id, createAndRunResponse.id).then(run => {
          // return if run is not completed
          if (run.status !== "completed") {
            return;
          }

          // get assistant response
          openai.beta.threads.messages.list(createAndRunResponse.thread_id).then(threadMessages => {
            // list thread messages content
            threadMessages.data.forEach((message, index) => {
              // @ts-ignore - we do have text value in content[0] but typescript doesn't know that
              // this is a 'openai' package type issue
              let assistantResponse = message.content?.[index]?.text?.value;

              // if assistant response is NO_ACTION or message role is 'user', do nothing
              if (assistantResponse === 'NO_ACTION' || threadMessages.data?.[index]?.role === 'user') {
                return;
              }

              // replace {user} from response template with @username
              assistantResponse = assistantResponse.replace('{user}', `@${context.payload.comment.user.login}`);
              // replace {proposalLink} from response template with the link to the comment
              assistantResponse = assistantResponse.replace('{proposalLink}', context.payload.comment.html_url);

              // create a comment with the assistant's response
              const comment = context.issue({body: assistantResponse});
              return context.octokit.issues.createComment(comment);
            });
          }).catch(err => console.log('threads.messages.list - err', err));

          // stop polling
          clearInterval(intervalID);
        }).catch(err => console.log('threads.runs.retrieve - err', err));
        
        // increment count for every threads.runs.retrieve call
        count++;
        console.log('threads.runs.retrieve - called:', count);
      }, 1500);
    }
    
    // return so that the bot doesn't hang (probot issue)
    return false;
  });
  // handle the case when somebody edits a comment on an issue to check whether it's a proposal
  // and what kind of changes were made
  app.on("issue_comment.edited", async (context) => {
    // check if the issue is still open
    // and the Help Wanted label is present (Expensify only)
    if (
      context.payload.issue.state === "open" 
      // && context.payload.issue.labels.find((label) => label.name === "Help Wanted") // Expensify only
    ) {
      if (!process.env.OPENAI_ASSISTANT_ID) {
        console.log('OPENAI_ASSISTANT_ID missing from .env file');
        return;
      }

      // 1. check if comment is proposal and if proposal template is followed
      const content = `I NEED HELP WITH CASE (2.) WHEN A USER THAT POSTED AN INITIAL PROPOSAL OR COMMENT (UNEDITED) THEN EDITS THE COMMENT - WE NEED TO CLASSIFY THE COMMENT BASED IN THE GIVEN INSTRUCTIONS AND IF TEMPLATE IS FOLLOWED AS PER INSTRUCTIONS. IT IS MANDATORY THAT YOU RESPOND ONLY WITH "NO_ACTION" IN CASE THE COMMENT IS NOT A PROPOSAL. \n\nPrevious comment content: ${context.payload.changes.body?.from}.\n\nEdited comment content: ${context.payload.comment.body}`;

      // create thread with first user message and run it
      const createAndRunResponse = await openai.beta.threads.createAndRun({
        assistant_id: process.env.OPENAI_ASSISTANT_ID,
        thread: {messages: [{ role: "user", content }],},
      });

      // count calls for debug purposes
      let count = 0;
      // poll for run completion
      const intervalID = setInterval(() => {
        openai.beta.threads.runs.retrieve(createAndRunResponse.thread_id, createAndRunResponse.id).then(run => {
          // return if run is not completed
          if (run.status !== "completed") {
            return;
          }

          // get assistant response
          openai.beta.threads.messages.list(createAndRunResponse.thread_id).then(threadMessages => {
            // list thread messages content
            threadMessages.data.forEach((message, index) => {
              // @ts-ignore - we do have text value in content[0] but typescript doesn't know that
              // this is a 'openai' package type issue
              let assistantResponse = message.content?.[index]?.text?.value;

              // if assistant response is NO_ACTION or message role is 'user', do nothing
              if (assistantResponse === 'NO_ACTION' || threadMessages.data?.[index]?.role === 'user') {
                return;
              }

              // edit comment if assistant detected substantial changes and if the comment was not edited already by the bot
              if (assistantResponse.includes('[EDIT_COMMENT]') && !context.payload.comment.body.includes('Edited by **proposal-police**')) {
                // extract the text after [EDIT_COMMENT] from assistantResponse
                const extractedNotice = assistantResponse.split('[EDIT_COMMENT] ')?.[1]?.replace('"', '');
                const botNoticeComment = `Edited by **proposal-police**: ${extractedNotice}\n\n`;
                
                const editComment = context.issue({
                  repo: context.payload.repository.name,
                  owner: context.payload.repository.owner.login,
                  comment_id: context.payload.comment.id,
                  body: botNoticeComment + context.payload.comment.body,
                });

                return context.octokit.issues.updateComment(editComment);
              }

              return;
            });
          }).catch(err => console.log('threads.messages.list - err', err));

          // stop polling
          clearInterval(intervalID);
        }).catch(err => console.log('threads.runs.retrieve - err', err));
        
        // increment count for every threads.runs.retrieve call
        count++;
        console.log('threads.runs.retrieve - called:', count);
      }, 1500);
    }
    
    // return so that the bot doesn't hang (probot issue)
    return false;
  });
};
