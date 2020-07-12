# cognito-dynamodb-migrate
Example helper to migrate Cognito users (via CSV), and to migrate DynamoDB table (via DynamoDB JSON and AWS CLI)


## Disclaimer
This is only a quick and (really) dirty script I used to migrate my app. It is not made to be universal nor bulletproof although it is fairly simple to change and adapt for your needs.
Idea is that this saves you some time, possibly all the time for small apps, and to offer you a starting point for your own implementation.

## what it does?
### migrates Cognito user pools
Actually just exports users to CSV and formats CSV so you can manually import it into a new user pool using Cognito console.
Note that there are several ways to migrate Cognito User pool, two main ones are described here: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-import-users.html
So, alternative is using Lambda that basically makes transition seamless to the user (interconnets old and new user pool).
CSV method puts users into RESET_REQUIRED status and your app needs to forward them to "forgot password" workflow to confirm their passwords once more.

I opted for simple CSV import:
- because it is much simpler for a small to medium apps
- because I didn't want to keep both UserPools active for that long (my users migrate very slowly)
- because my database links some data with usernames (which are login alias for email) so in "seamless" method there was a chance that a completely new user would "steal" old username (although with new email) exposing that data to him.

Script uses [cognito-backup-restore](https://github.com/rahulpsd18/cognito-backup-restore) tool to pull Cognito users and then just converts JSON to CSV for manual import. A feature missing in cognito-backup-restore.
Note that cognito-backup-restore does have a restore feature too, but it sends out emails to users which was not what I wanted. I wanted this migration silent.

IMPORTANT: Check the script before running, script exports only a few fields I needed, if you use more than that you'll have to change some code!

### migrates DynamoDB table
AWS CLI is used (this is a required external dependency!) to pull DynamoDB JSON (`aws dynamodb scan`). Then script goes through JSON and uses `aws dynamodb put-item` to import all into a new table. `batch-write` was something to think about (it can do 25 records in a batch) but my table was small enough to do it this way.

Again, there are other options to migrate DynamoDB, Amazon suggests [AWS Data Pipeline](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBPipeline.html) but for small to medium tables that's an overkill.


## Requirements
- AWS CLI installed and configured with credentials... this script will not ask for any of those, it will just run AWS CLI from node `spawn`. cognito-backup-restore does similar.
- change config section in index.js to point to your resources!
- check/change Cognito column mappings in index.js to match your needs!
