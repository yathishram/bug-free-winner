const express = require("express");
const bodyParser = require("body-parser");
const { sequelize } = require("./model");
const { Op } = require("sequelize");
const { getProfile } = require("./middleware/getProfile");
const { ContractStatus } = require("./constants/common.constants");
const moment = require("moment");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

/****************
 * Contracts Operations
 *****************/
/**
 * This endpoint returns contract by id
 * @returns contract by id
 */
app.get("/contracts/:id", getProfile, async (req, res) => {
  // Step 1: Get the Contract model
  const { Contract, Profile } = req.app.get("models");

  try {
    // Step 2: Get the id from the request
    const { id } = req.params;

    // Step 3: Find the contract by id and the profile id which is either the client or the contractor
    const contract = await Contract.findOne({
      where: {
        id,
        [Op.or]: [
          { ClientId: req.profile.id },
          { ContractorId: req.profile.id },
        ],
      },
    });

    // Step 4: If the contract is not found, return a 404 response
    if (!contract) return res.status(404).json({ message: "Contract not found" });

    // Step 5: Return the contract
    res.json({
      contract: {
        id: contract.id,
        terms: contract.terms,
        status: contract.status,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        client: {
          id: contract.ClientId,
          type: "client",
        },
        contractor: {
          id: contract.ContractorId,
          type: "contractor",
        },
      },
    });
  } catch (error) {
    console.error("Failed to retrieve contract:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching contract." });
  }
});

/**
 * Returns a list of contracts belonging to a user (client or contractor), the list should only contain non terminated contracts.
 */
app.get("/contracts", getProfile, async (req, res) => {
  // Step 1: Get the Contract model
  const { Contract } = req.app.get("models");

  try {
    // Step 2: Find all contracts that belong to the user (client or contractor) and are not terminated
    const contracts = await Contract.findAll({
      where: {
        [Op.or]: [
          { ClientId: req.profile.id },
          { ContractorId: req.profile.id },
        ],
        status: {
          [Op.ne]: ContractStatus.TERMINATED,
        },
      },
      attributes: ["id", "terms", "status", "createdAt", "updatedAt"],
    });

    // Step 3: Return the list of contracts
    res.json({
      contracts,
    });
  } catch (error) {
    console.error("Failed to retrieve contracts:", error);
    res
      .status(500)
      .json({ message: "Internal server error while fetching contracts." });
  }
});

/****************
 * Jobs Operations
 *****************/
/**
 * Get all unpaid jobs for a user (**_either_** a client or contractor), for **_active contracts only_**.
 */
app.get("/jobs/unpaid", getProfile, async (req, res) => {
  const { Job, Contract } = req.app.get("models");

  try {
    const jobs = await Job.findAll({
      include: [
        {
          model: Contract,
          where: {
            [Op.or]: [
              { ClientId: req.profile.id },
              { ContractorId: req.profile.id },
            ],
            status: ContractStatus.IN_PROGRESS, // Ensure only active contracts are considered
          },
          attributes: [], // No contract fields are needed in the response
        },
      ],
      where: {
        paid: null, // Specifically looking for unpaid jobs where 'paid' is null
      },
      attributes: ["id", "description", "price", "paymentDate", "ContractId"], // Custom attributes for the job
    });

    // Return the jobs found
    res.json({ jobs });
  } catch (error) {
    console.error("Failed to retrieve unpaid jobs:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching unpaid jobs." });
  }
});

/**
 * Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
 */
app.post("/jobs/:job_id/pay", getProfile, async (req, res) => {
  const { Job, Contract, Profile } = req.app.get("models");
  const { job_id } = req.params;

   // Step 1: Check if the user is a client
   if (req.profile.type !== "client") {
    return res
      .status(403)
      .json({ message: "Unauthorized action. Only clients can pay for jobs." });
  }

  const t = await sequelize.transaction(); // Start a transaction

  try {
    //Step 2: Fetch the job with its related contract
    const job = await Job.findByPk(job_id, {
      include: {
        model: Contract,
        attributes: ["status", "ClientId", "ContractorId"],
        where: { ClientId: req.profile.id },  // Ensure the job belongs to the logged-in client
        include: [
          { model: Profile, as: "Client", attributes: ["id", "balance"] },
          { model: Profile, as: "Contractor", attributes: ["id", "balance"] },
        ],
      },
      transaction: t,
      lock: t.LOCK.UPDATE, // Lock the record to prevent concurrent updates
    });

    if (!job) {
      await t.rollback();
      return res.status(404).json({ message: "Job not found or does not belong to client." });
    }


    //Step 3: Check if the job is already paid
    if (job.paid) {
      await t.rollback();
      return res.status(400).json({ message: "This job has already been paid." });
    }

    //Step 4: Check if the contract is in progress
    if (job.Contract.status !== "in_progress") {
      await t.rollback();
      return res.status(400).json({
        message:
          "Payment can only be processed for jobs under contracts that are Active.",
      });
    }

    //Step 5: Check if client balance is sufficient
    if (job.Contract.Client.balance < job.price) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "Insufficient balance to make the payment." });
    }

    //Step 6: Process the payment: deduct from client, add to contractor
    job.Contract.Client.balance -= job.price;
    job.Contract.Contractor.balance += job.price;
    job.paid = true; // Mark job as paid
    job.paymentDate = new Date(); // Set payment date

    //Step 7: Save all changes
    await job.Contract.Client.save({ transaction: t });
    await job.Contract.Contractor.save({ transaction: t });
    await job.save({ transaction: t });

    await t.commit(); // Commit the transaction

    res.json({ message: "Job payment processed successfully" });
  } catch (error) {
    // Rollback transaction if any errors occur
    await t.rollback();
    console.error("Failed to process job payment:", error);
    res
      .status(500)
      .json({ error: "Internal server error while processing payment." });
  }
});

/****************
 * Balances Operations
 * ***************/

/**
 * Deposits money into the the the balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
 */
app.post("/balances/deposit/:userId", getProfile, async (req, res) => {
  const { userId } = req.params;
  const { amount } = req.body; // Ensure the amount is passed as a part of the request body and is validated

  if (req.profile.type !== "client") {
    return res.status(403).json({
      error: "Unauthorized. Only clients can deposit into their own accounts.",
    });
  }

  const { Profile, Job, Contract } = req.app.get("models");

  const t = await sequelize.transaction();

  try {
    //Step 1: Verify the client exists
    const client = await Profile.findByPk(userId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!client) {
      await t.rollback();
      return res.status(404).json({ error: "Client not found." });
    }

    if(client.id !== req.profile.id){ 
      await t.rollback();
      return res.status(403).json({ error: "Unauthorized. You can only deposit into your own account." });
    }

    if(amount <= 0){ 
      await t.rollback();
      return res.status(400).json({ error: "Deposit amount must be greater than 0." });
    }

    //Step 2: Calculate the total of unpaid jobs for this client
    const jobsTotal = await Job.sum("price", {
      include: [
        {
          model: Contract,
          attributes: [],
          where: { ClientId: userId, status: "in_progress" },
        },
      ],
      where: { paid: null },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    //Step 3: Calculate the maximum allowable deposit
    const maxDeposit = jobsTotal * 0.25;

    //Step 4: Check if the deposit amount exceeds the maximum allowable
    if (amount > maxDeposit) {
      await t.rollback();
      return res.status(400).json({
        error: `Deposit amount exceeds the allowable limit of 25% of total unpaid jobs ($${maxDeposit.toFixed(
          2
        )}).`,
      });
    }

    // Step 5: Process the deposit
    client.balance += amount;
    await client.save({ transaction: t });

    // Step 6: Commit the transaction
    await t.commit();

    res.json({ message: "Deposit successful.", newBalance: client.balance });
  } catch (error) {
    await t.rollback();
    console.error("Failed to process deposit:", error);
    res
      .status(500)
      .json({ error: "Internal server error while processing deposit." });
  }
});

/****************
 * Admin Operations
 * ***************/

/**
 * Returns the profession that earned the most money within a specific date range.
 * The start and end dates can be of the format 'YYYY-MM-DD'.
 */
app.get("/admin/best-profession", async (req, res) => {
  const { start, end } = req.query;

  // Convert and validate provided dates or assign default values
  let startDate = start
    ? moment(start, "YYYY-MM-DD")
    : moment().startOf("year");
  let endDate = end ? moment(end, "YYYY-MM-DD") : moment();

  // Ensure the start date is before the end date
  if (startDate.isAfter(endDate)) {
    return res
      .status(400)
      .json({ error: "Start date must be before end date." });
  }

  const { Job, Contract, Profile } = req.app.get("models");

  try {
    // Step 1: Find the profession that earned the most money within the specified date range
    // Step 2: Use Sequelize's aggregate functions to calculate the total earnings for each profession
    // Step 3: Group the results by profession and order them in descending order
    const bestProfession = await Job.findAll({
      attributes: [
        [sequelize.fn("sum", sequelize.col("price")), "total_earnings"],
        [sequelize.col("Contract.Contractor.profession"), "profession"], // Accessing the profession
      ],
      include: [
        {
          model: Contract,
          attributes: [],
          include: [
            {
              model: Profile,
              as: "Contractor",
              attributes: [],
            },
          ],
        },
      ],
      where: {
        paymentDate: {
          [Op.between]: [startDate.toDate(), endDate.toDate()],
        },
        paid: true,
      },
      group: [sequelize.col("Contract.Contractor.profession")], // Group by profession
      order: [[sequelize.fn("sum", sequelize.col("price")), "DESC"]],
      limit: 1, // Limit to the top profession
      raw: true,
    });

    if (bestProfession.length === 0) {
      return res
        .status(404)
        .json({
          message: "No professions found within the specified date range.",
        });
    }

    const { profession, total_earnings } = bestProfession[0];

    res.json({
      profession: profession,
      total_earnings: parseFloat(total_earnings).toFixed(2), // Format earnings for readability
    });
  } catch (error) {
    console.error("Failed to fetch professions:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching professions." });
  }
});

/**
 * Returns the clients the paid the most for jobs in the query time period. limit query parameter should be applied, default limit is 2.
 */
app.get("/admin/best-clients", async (req, res) => {
  const { start, end, limit = 2 } = req.query; // Default limit is 2 if not specified

  let startDate = start
    ? moment(start, "YYYY-MM-DD")
    : moment().startOf("year");
  let endDate = end ? moment(end, "YYYY-MM-DD") : moment();

  // Validate that the start date is before the end date
  if (startDate.isAfter(endDate)) {
    return res
      .status(400)
      .json({ error: "Start date must be before end date." });
  }

  const { Job, Contract, Profile } = req.app.get("models");

  try {
    const clients = await Job.findAll({
      attributes: [
        [sequelize.fn("sum", sequelize.col("price")), "total_paid"],
        [sequelize.col("Contract.Client.id"), "id"],
        [sequelize.col("Contract.Client.firstName"), "firstName"],
        [sequelize.col("Contract.Client.lastName"), "lastName"],
      ],
      include: [
        {
          model: Contract,
          attributes: [],
          include: [
            {
              model: Profile,
              as: "Client",
              attributes: [],
            },
          ],
        },
      ],
      where: {
        paymentDate: {
          [Op.between]: [startDate.toDate(), endDate.toDate()],
        },
        paid: true,
      },
      group: ["Contract.Client.id"], // Group by client ID
      order: [[sequelize.fn("sum", sequelize.col("price")), "DESC"]],
      limit: parseInt(limit), // Apply the limit
      raw: true,
    });

    if (clients.length === 0) {
      return res
        .status(404)
        .json({ message: "No clients found within the specified date range." });
    }

    res.json(
      {
        clients: clients.map((client) => ({
          id: client.id,
          fullName: `${client.firstName} ${client.lastName}`,
          total_paid: parseFloat(client.total_paid).toFixed(2),
        }))
      }
    );
  } catch (error) {
    console.error("Failed to fetch the best clients:", error);
    res
      .status(500)
      .json({
        error: "Internal server error while fetching the best clients.",
      });
  }
});

/**
 * Given a client just return the client details
 */
app.get("/admin/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { Profile } = req.app.get("models");

  try {
    const client = await Profile.findOne({
      where: {
        id: userId,
      },
      attributes: ["id", "firstName", "lastName", "balance"],
    });

    if (!client) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(client);
  } catch (error) {
    console.error("Failed to fetch User:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching User." });
  }
});



module.exports = app;
