
import { Context } from "probot";
import OpenAI from './openai'
import * as CONFIG from './config';

// populate process.env with values from .env file otherwise tests will fail
require("dotenv").config("../.env");

/** Handles the case when somebody posts a new comment on an issue to determine whether it's a proposal and so if it follows the template.
 * @param context - probot context
 */
async function handleIssueCommentCreated(context: Context<'issue_comment.created'>) {
  // check if the issue is opened and if the Help Wanted label is present
    if (
        context.payload.issue.state === "open" &&
        context.payload.issue.labels.find((label) => label.name === "Help Wanted")
    ) {
        if (!CONFIG.OPENAI_ASSISTANT_ID) {
            console.log('CONFIG.OPENAI_ASSISTANT_ID missing from .env file');
            return;
        }

        // 1, check if comment is proposal and if proposal template is followed
        const content = `I NEED HELP WITH CASE (1.), CHECK IF COMMENT IS PROPOSAL AND IF TEMPLATE IS FOLLOWED AS PER INSTRUCTIONS. IT IS MANDATORY THAT YOU RESPOND ONLY WITH "NO_ACTION" IN CASE THE COMMENT IS NOT A PROPOSAL. Comment content: ${context.payload.comment.body}`;

        // create thread with first user message and run it
        const createAndRunResponse = await OpenAI.beta.threads.createAndRun({
            assistant_id: CONFIG.OPENAI_ASSISTANT_ID ?? '',
            thread: {messages: [{ role: "user", content }],},
        });

        // count calls for debug purposes
        let count = 0;
        // poll for run completion
        const intervalID = setInterval(() => {
            OpenAI.beta.threads.runs.retrieve(createAndRunResponse.thread_id, createAndRunResponse.id).then(run => {
            // return if run is not completed
            if (run.status !== "completed") {
                return;
            }

            // get assistant response
            OpenAI.beta.threads.messages.list(createAndRunResponse.thread_id).then(threadMessages => {
            // list thread messages content
            threadMessages.data.forEach((message, index) => {
                // @ts-ignore - we do have text value in content[0] but typescript doesn't know that
                // this is a 'openai' package type issue
                let assistantResponse = message.content?.[index]?.text?.value;
                console.log('issue_comment.created - assistantResponse', assistantResponse);

                if (!assistantResponse) {
                    return console.log('issue_comment.created - assistantResponse is empty');
                }

                // check if assistant response is either NO_ACTION or "NO_ACTION" strings
                // as sometimes the assistant response varies
                const isNoAction = assistantResponse === 'NO_ACTION' || assistantResponse === '"NO_ACTION"';
                // if assistant response is NO_ACTION or message role is 'user', do nothing
                if (isNoAction || threadMessages.data?.[index]?.role === 'user') {
                    if (threadMessages.data?.[index]?.role === 'user')  {
                        return;
                    }
                    return console.log('issue_comment.created - NO_ACTION');
                }

                // if the assistant responded with no action but there's some context in the response
                if (assistantResponse.includes('[NO_ACTION]')) {
                    // extract the text after [NO_ACTION] from assistantResponse since this is a
                    // bot related action keyword
                    const noActionContext = assistantResponse.split('[NO_ACTION] ')?.[1]?.replace('"', '');
                    console.log('issue_comment.created - [NO_ACTION] w/ context: ', noActionContext);
                    return;
                }

                // replace {user} from response template with @username
                assistantResponse = assistantResponse.replace('{user}', `@${context.payload.comment.user.login}`);
                // replace {proposalLink} from response template with the link to the comment
                assistantResponse = assistantResponse.replace('{proposalLink}', context.payload.comment.html_url);

                // remove any double quotes from the final comment because sometimes the assistant's
                // response contains double quotes / sometimes it doesn't
                assistantResponse = assistantResponse.replace('"', '');
                // create a comment with the assistant's response
                const comment = context.issue({body: assistantResponse});
                console.log('issue_comment.created - proposal-police posts comment');
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
}

/** Handles the case when somebody edits a comment on an issue to check whether it's a proposal and what kind of changes were made.
 * @param context - probot context
 */
async function handleIssueCommentEdited(context: Context<'issue_comment.edited'>) {
    // check if the issue is still open
    // and the Help Wanted label is present
    if (
        context.payload.issue.state === "open" &&
        context.payload.issue.labels.find((label) => label.name === "Help Wanted")
    ) {
        if (!CONFIG.OPENAI_ASSISTANT_ID) {
            console.log('CONFIG.OPENAI_ASSISTANT_ID missing from .env file');
            return;
        }

        // 1. check if comment is proposal and if proposal template is followed
        const content = `I NEED HELP WITH CASE (2.) WHEN A USER THAT POSTED AN INITIAL PROPOSAL OR COMMENT (UNEDITED) THEN EDITS THE COMMENT - WE NEED TO CLASSIFY THE COMMENT BASED IN THE GIVEN INSTRUCTIONS AND IF TEMPLATE IS FOLLOWED AS PER INSTRUCTIONS. IT IS MANDATORY THAT YOU RESPOND ONLY WITH "NO_ACTION" IN CASE THE COMMENT IS NOT A PROPOSAL. \n\nPrevious comment content: ${context.payload.changes.body?.from}.\n\nEdited comment content: ${context.payload.comment.body}`;

        // create thread with first user message and run it
        const createAndRunResponse = await OpenAI.beta.threads.createAndRun({
            assistant_id: CONFIG.OPENAI_ASSISTANT_ID ?? '',
            thread: {messages: [{ role: "user", content }],},
        });

        // count calls for debug purposes
        let count = 0;
        // poll for run completion
        const intervalID = setInterval(() => {
            OpenAI.beta.threads.runs.retrieve(createAndRunResponse.thread_id, createAndRunResponse.id).then(run => {
                // return if run is not completed yet
                if (run.status !== "completed") {
                    console.log('issue_comment.edited - run pending completion');
                    return;
                }
    
                // get assistant response
                OpenAI.beta.threads.messages.list(createAndRunResponse.thread_id).then(threadMessages => {
                    // list thread messages content
                    threadMessages.data.forEach((message, index) => {
                        // @ts-ignore - we do have text value in content[0] but typescript doesn't know that
                        // this is a 'openai' package type issue
                        let assistantResponse = message.content?.[index]?.text?.value;
                        console.log('issue_comment.edited - assistantResponse', assistantResponse);
        
                        if (!assistantResponse) {
                            return console.log('issue_comment.edited - assistantResponse is empty');
                        }
        
                        // check if assistant response is either NO_ACTION or "NO_ACTION" strings
                        // as sometimes the assistant response varies
                        const isNoAction = assistantResponse === 'NO_ACTION' || assistantResponse === '"NO_ACTION"';
                        // if assistant response is NO_ACTION or message role is 'user', do nothing
                        if (isNoAction || threadMessages.data?.[index]?.role === 'user') {
                            if (threadMessages.data?.[index]?.role === 'user')  {
                                return;
                            }
                            return console.log('issue_comment.edited - NO_ACTION');
                        }
        
                        // edit comment if assistant detected substantial changes and if the comment was not edited already by the bot
                        if (assistantResponse.includes('[EDIT_COMMENT]') && !context.payload.comment.body.includes('Edited by **proposal-police**')) {
                            // extract the text after [EDIT_COMMENT] from assistantResponse since this is a
                            // bot related action keyword
                            let extractedNotice = assistantResponse.split('[EDIT_COMMENT] ')?.[1]?.replace('"', '');
                            // format the github's updated_at like: 2024-01-24 13:15:24 UTC not 2024-01-28 18:18:28.000 UTC
                            const date = new Date(context.payload.comment.updated_at);
                            const formattedDate = date.toISOString()?.split('.')?.[0]?.replace('T', ' ') + ' UTC';
                            extractedNotice = extractedNotice.replace('{added_timestamp}', formattedDate);
                            
                            const editComment = context.issue({
                                repo: context.payload.repository.name,
                                owner: context.payload.repository.owner.login,
                                comment_id: context.payload.comment.id,
                                body: `${extractedNotice}\n\n` + context.payload.comment.body,
                            });
            
                            console.log(`issue_comment.edited - proposal-police edits comment: ${context.payload.comment.id}`);
                            return context.octokit.issues.updateComment(editComment);
                        }
        
                        return false;
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
}

export {
    handleIssueCommentCreated,
    handleIssueCommentEdited,
};
