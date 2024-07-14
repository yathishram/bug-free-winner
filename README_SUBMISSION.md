# DEEL BACKEND TASK

Time taken to finish: 2hours approx

## Getting Set Up

1. Start by creating a local repository for this folder.

2. In the repo root directory, run `npm install` to gather all dependencies.

3. Next, `npm run seed` will seed the local SQLite database. **Warning: This will drop the database if it exists**. The database lives in a local file `database.sqlite3`.

4. Then run `npm start` which should start both the server.

5. Alternatively, you can run `npm run test` to run the tests which covers all the APIs.

## APIs Implemented

Below is a list of the required API's for the application.

1. **_GET_** `/contracts/:id` - It should return the contract only if it belongs to the profile calling. -
            Status: Fixed.
            Note: Can make it better to include client and contractor details in response.

2. **_GET_** `/contracts` - Returns a list of contracts belonging to a user (client or contractor), the list should only contain non terminated contracts.|
            Status: Done.

3. **_GET_** `/jobs/unpaid` - Get all unpaid jobs for a user (**_either_** a client or contractor), for **_active contracts only_**.
            Status: Done.

4. **_POST_** `/jobs/:job_id/pay` - Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
            Status: Done.
            Note: Uses the transaction lock to ensure that the balance is updated correctly.

5. **_POST_** `/balances/deposit/:userId` - Deposits money into the the the balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
            Status: Done.
            Note: Uses the transaction lock to ensure that the balance is updated correctly.

6. **_GET_** `/admin/best-profession?start=<date>&end=<date>` - Returns the profession that earned the most money (sum of jobs paid) for any contactor that worked in the query time range.
            Status: Done.

7. **_GET_** `/admin/best-clients?start=<date>&end=<date>&limit=<integer>` - returns the clients the paid the most for jobs in the query time period. limit query parameter should be applied, default limit is 2.
            Status: Done.

## Going Above and Beyond the Requirements

1. Could have added docker based testing for making the testing env different from the actual db to keep the data clean.
2. Could have added more tests for edge cases
3. Could have added more validations for the APIs
4. Could have added more error handling for the APIs - Like a global error handler for both db and api errors.

## Reach out to me if you have any questions or need any clarifications

<123yathish.r@gmail.com>

## See you on the other side!   🚀
