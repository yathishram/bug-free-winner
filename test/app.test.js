const request = require("supertest");
const app = require("../src/app");
const {
  assert200Body,
  assertErrStatus,
} = require("../src/utils/int-spec-helper.utils");

describe("Tests", () => {
  describe("Contract based tests", () => {
    describe("GET /contracts/:id", () => {
      it("should retrieve the contract if the user is related as client", async () => {
        const response = await request(app)
          .get("/contracts/1")
          .set("profile_id", 1) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              contract: {
                id: 1,
                terms: "bla bla bla",
                status: "terminated",
                createdAt: "2024-07-14T12:42:27.252Z",
                updatedAt: "2024-07-14T12:42:27.252Z",
                client: { id: 1, type: "client" },
                contractor: { id: 5, type: "contractor" },
              },
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should retrieve the contract if the user is related as contractor", async () => {
        const response = await request(app)
          .get("/contracts/1")
          .set("profile_id", 5) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              contract: {
                id: 1,
                terms: "bla bla bla",
                status: "terminated",
                createdAt: "2024-07-14T12:42:27.252Z",
                updatedAt: "2024-07-14T12:42:27.252Z",
                client: { id: 1, type: "client" },
                contractor: { id: 5, type: "contractor" },
              },
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should deny access if the user is not related to the contract", async () => {
        const response = await request(app)
          .get("/contracts/2")
          .set("profile_id", 5); // Set the profile_id header

        assertErrStatus(expect, response, 404, ["Contract not found"]);
      });
    });

    describe("GET /contracts/", () => {
      it("should retrieve all the contracts if the user is related as client", async () => {
        const response = await request(app)
          .get("/contracts")
          .set("profile_id", 4) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              contracts: [
                {
                  id: 7,
                  terms: "bla bla bla",
                  status: "in_progress",
                  createdAt: "2024-07-14T13:03:13.340Z",
                  updatedAt: "2024-07-14T13:03:13.340Z",
                },
                {
                  id: 8,
                  terms: "bla bla bla",
                  status: "in_progress",
                  createdAt: "2024-07-14T13:03:13.340Z",
                  updatedAt: "2024-07-14T13:03:13.340Z",
                },
                {
                  id: 9,
                  terms: "bla bla bla",
                  status: "in_progress",
                  createdAt: "2024-07-14T13:03:13.341Z",
                  updatedAt: "2024-07-14T13:03:13.341Z",
                },
              ],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should retrieve all the contracts if the user is related as contractor", async () => {
        const response = await request(app)
          .get("/contracts")
          .set("profile_id", 6) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              contracts: [
                {
                  id: 2,
                  terms: "bla bla bla",
                  status: "in_progress",
                  createdAt: "2024-07-14T13:03:13.340Z",
                  updatedAt: "2024-07-14T13:03:13.340Z",
                },
                {
                  id: 3,
                  terms: "bla bla bla",
                  status: "in_progress",
                  createdAt: "2024-07-14T13:03:13.340Z",
                  updatedAt: "2024-07-14T13:03:13.340Z",
                },
                {
                  id: 8,
                  terms: "bla bla bla",
                  status: "in_progress",
                  createdAt: "2024-07-14T13:03:13.341Z",
                  updatedAt: "2024-07-14T13:03:13.341Z",
                },
              ],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should retrieve empty contracts for the user who has only terminated contracts", async () => {
        const response = await request(app)
          .get("/contracts")
          .set("profile_id", 5) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              contracts: [],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });
    });
  });

  describe("Balance based tests", () => {
    describe("POST /balances/deposit/:userId", () => {
      it("should throw an error when contractor tries to add balance", async () => {
        const response = await request(app)
          .post("/balances/deposit/5")
          .set("profile_id", 5)
          .send({ amount: 100 });

        assertErrStatus(expect, response, 403, [
          "Unauthorized. Only clients can deposit into their own accounts.",
        ]);
      });

      it("should throw an error when client tries to add balance to different account", async () => {
        const response = await request(app)
          .post("/balances/deposit/5")
          .set("profile_id", 1)
          .send({ amount: 100 });

        assertErrStatus(expect, response, 403, [
          "Unauthorized. You can only deposit into your own account.",
        ]);
      });

      it("should throw an error when client tries to add negative balance", async () => {
        const response = await request(app)
          .post("/balances/deposit/2")
          .set("profile_id", 2)
          .send({ amount: -1 });

        assertErrStatus(expect, response, 400, [
          "Deposit amount must be greater than 0.",
        ]);
      });

      it("should throw an error when client tries to add more than 25% of the total unpaid jobs", async () => {
        const response = await request(app)
          .post("/balances/deposit/2")
          .set("profile_id", 2)
          .send({ amount: 1000 });
        assertErrStatus(expect, response, 400, [
          "Deposit amount exceeds the allowable limit of 25% of total unpaid jobs ($100.50).",
        ]);
      });

      it("should add balance to client account", async () => {
        const clientResponse = await request(app).get("/admin/user/2");
        const originalClientBalance = clientResponse.body.balance;

        const response = await request(app)
          .post("/balances/deposit/2")
          .set("profile_id", 2)
          .send({ amount: 100 });

        assert200Body(expect, response, [
          {
            message: "Deposit successful.",
            newBalance: originalClientBalance + 100,
          },
        ]);
      });
    });
  });

  describe("Jobs based tests", () => {
    describe("GET /jobs/unpaid", () => {
      it("should retrieve the unpaid jobs if the user is related as client", async () => {
        const response = await request(app)
          .get("/jobs/unpaid")
          .set("profile_id", 1) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              jobs: [
                {
                  id: 2,
                  description: "work",
                  price: 201,
                  paymentDate: null,
                  ContractId: 2,
                },
              ],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should retrieve the unpaid jobs if the user is related as contractor", async () => {
        const response = await request(app)
          .get("/jobs/unpaid")
          .set("profile_id", 6) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              jobs: [
                {
                  id: 2,
                  description: "work",
                  price: 201,
                  paymentDate: null,
                  ContractId: 2,
                },
                {
                  id: 3,
                  description: "work",
                  price: 202,
                  paymentDate: null,
                  ContractId: 3,
                },
              ],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should return empty jobs if the user has all jobs in paid status", async () => {
        const response = await request(app)
          .get("/jobs/unpaid")
          .set("profile_id", 5) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              jobs: [],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });

      it("should return one job when the contract for client is in progress and previous job is paid", async () => {
        const response = await request(app)
          .get("/jobs/unpaid")
          .set("profile_id", 4) // Set the profile_id header
          .expect(200);

        assert200Body(
          expect,
          response,
          [
            {
              jobs: [
                {
                  id: 5,
                  description: "work",
                  price: 200,
                  paymentDate: null,
                  ContractId: 7,
                },
              ],
            },
          ],
          "id",
          ["createdAt", "updatedAt"]
        );
      });
    });

    describe("POST /jobs/:job_id/pay", () => {
      it("should throw an error when contractor tries to pay himself", async () => {
        const response = await request(app)
          .post("/jobs/2/pay")
          .set("profile_id", 6); // Set the profile_id header

        assertErrStatus(expect, response, 403, [
          "Unauthorized action. Only clients can pay for jobs.",
        ]);
      });

      it("should throw an error when client doesn't have access to the job", async () => {
        const response = await request(app)
          .post("/jobs/2/pay")
          .set("profile_id", 2); // Set the profile_id header

        assertErrStatus(expect, response, 404, [
          "Job not found or does not belong to client.",
        ]);
      });

      it("should throw an error when client tries to pay for a job already paid", async () => {
        const response = await request(app)
          .post("/jobs/6/pay")
          .set("profile_id", 4); // Set the profile_id header

        assertErrStatus(expect, response, 400, [
          "This job has already been paid.",
        ]);
      });

      it("should throw an error when client tries to pay for a job which is not active", async () => {
        const response = await request(app)
          .post("/jobs/1/pay")
          .set("profile_id", 1); // Set the profile_id header

        assertErrStatus(expect, response, 400, [
          "Payment can only be processed for jobs under contracts that are Active.",
        ]);
      });

      it("should successfully pay a job", async () => {
        const clientResponse = await request(app).get("/admin/user/2");

        const contractorResponse = await request(app).get("/admin/user/6");

        const unpaidJobsResponse = await request(app)
          .get("/jobs/unpaid")
          .set("profile_id", clientResponse.body.id);

        const jobToPay = unpaidJobsResponse.body.jobs[0];

        const originalClientBalance = clientResponse.body.balance;
        const originalContractorBalance = contractorResponse.body.balance;
        const originalJobPrice = jobToPay.price;

        const response = await request(app)
          .post(`/jobs/${jobToPay.id}/pay`)
          .set("profile_id", clientResponse.body.id); // Set the profile_id header

        assert200Body(expect, response, [
          {
            message: "Job payment processed successfully",
          },
        ]);

        const updatedClientResponse = await request(app).get("/admin/user/2");

        const updatedContractorResponse = await request(app).get(
          "/admin/user/6"
        );

        expect(updatedClientResponse.body.balance).toEqual(
          originalClientBalance - originalJobPrice
        );
        expect(updatedContractorResponse.body.balance).toEqual(
          originalContractorBalance + originalJobPrice
        );
      });

      it("should throw an error when client tries to pay for a job on low balance", async () => {
        const unpaidJobsResponseForClient = await request(app)
          .get("/jobs/unpaid")
          .set("profile_id", 2);

        const jobToPay = unpaidJobsResponseForClient.body.jobs[0];

        const response = await request(app)
          .post(`/jobs/${jobToPay.id}/pay`)
          .set("profile_id", 2); // Set the profile_id header

        assertErrStatus(expect, response, 400, [
          "Insufficient balance to make the payment.",
        ]);
      });
    });
  });

  describe("Admin based tests", () => {
    describe("GET /admin/best-profession", () => {
      it("should throw an error when start time is greater than end time", async () => {
        const response = await request(app)
          .get("/admin/best-profession")
          .query({ start: "2021-01-05", end: "2020-01-01" });

        assertErrStatus(expect, response, 400, [
          "Start date must be before end date.",
        ]);
      });

      it("should get top profession when no end date is given", async () => {
        const response = await request(app)
          .get("/admin/best-profession")
          .query({ start: "2024-06-17" });

        assert200Body(expect, response, [
          { profession: "Programmer", total_earnings: "202.00" },
        ]);
      });

      it("should get top profession when start date and end date is given", async () => {
        const response = await request(app)
          .get("/admin/best-profession")
          .query({ start: "2020-06-18", end: "2024-06-18" });

        console.log(response.body);

        assert200Body(expect, response, [
          { profession: "Programmer", total_earnings: "2683.00" },
        ]);
      });
    });

    describe("GET /admin/best-clients", () => {
      it("should throw an error when start time is greater than end time", async () => {
        const response = await request(app)
          .get("/admin/best-clients")
          .query({ start: "2021-01-05", end: "2020-01-01" });

        assertErrStatus(expect, response, 400, [
          "Start date must be before end date.",
        ]);
      });

      it("should get best clients when no end date is given", async () => {
        const response = await request(app)
          .get("/admin/best-clients")
          .query({ start: "2020-06-17" });

        assert200Body(expect, response, [
          {
            clients: [
              { id: 4, fullName: "Ash Kethcum", total_paid: "2020.00" },
              { id: 2, fullName: "Mr Robot", total_paid: "644.00" },
            ],
          },
        ]);
      });

      it("should get best clients when start date and end date is given and limit is 4", async () => {
        const response = await request(app)
          .get("/admin/best-clients")
          .query({ start: "2020-06-17", end: "2024-06-18", limit: 4 });

        assert200Body(expect, response, [
          {
            clients: [
              { id: 4, fullName: "Ash Kethcum", total_paid: "2020.00" },
              { id: 2, fullName: "Mr Robot", total_paid: "442.00" },
              { id: 1, fullName: "Harry Potter", total_paid: "442.00" },
              { id: 3, fullName: "John Snow", total_paid: "200.00" },
            ],
          },
        ]);
      });
    });
  });
});
