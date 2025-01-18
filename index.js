require('dotenv').config()
const express = require('express')
const app = express();
const cors = require('cors')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uu4gd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const userCollection = client.db('BworkerDB').collection('users')
        const tasksCollection = client.db('BworkerDB').collection('tasks')
        const submitTasksCollection = client.db('BworkerDB').collection('submitTasks')
        const withdrawReqCollection = client.db('BworkerDB').collection('withdrawReq')
        const paymentCollection = client.db('BworkerDB').collection('payments')
        

        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: ' Unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: ' Unauthorized access' })
                }
                req.decoded = decoded;
                next()
            })
        }
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            next();
        }
        const verifyBuyer = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isBuyer = user?.role === 'buyer'
            if (!isBuyer) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            next()
        }
        const veryfyWorker = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isWorker = user?.role === 'worker'
            if (!isWorker) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            next()
        }
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' })
            res.send({ token })
        })
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query)
            const worker = user?.role === 'worker'
            const buyer = user?.role === 'buyer'
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            let coin = 0
            if (worker) {
                coin = 10
            }
            if (buyer) {
                coin = 50
            }
            const newUser = {
                name: user.name,
                email: user.email,
                role: user.role,
                coin,
            }
            const result = await userCollection.insertOne(newUser)
            res.send(result)
        })
        app.get('/user/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin })

        })
        app.get('/user/buyer/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let buyer = false
            if (user) {
                buyer = user?.role === 'buyer'
            }
            res.send({ buyer })

        })
        app.get('/user/worker/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let worker = false
            if (user) {
                worker = user?.role === 'worker'
            }
            res.send({ worker })

        })
        app.get('/coin/:email', async (req, res) => {
            const email = req.params.email
            const result = await userCollection.aggregate([{
                $match: { email: email }
            }, {
                $group: {
                    _id: '$email',
                    totalcoin: {
                        $sum: '$coin'
                    }
                }
            }]).toArray()
            const coins = result.length > 0 ? result[0].totalcoin : 0;
            res.send({ coins })
        })
        app.post('/taskItems', async (req, res) => {
            const taskItem = req.body
            const email = taskItem.email
            const totalCoin = taskItem.requiredWorks * taskItem.payableAmount
            const updatedUser = await userCollection.updateOne(
                { email },
                { $inc: { coin: -totalCoin } }
            );
            const result = await tasksCollection.insertOne(taskItem)
            res.send({ result, updatedUser })
        })
        app.get('/mytasks/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await tasksCollection.find(query).toArray()
            res.send(result)
        })
        app.get('/updateTask/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await tasksCollection.findOne(query)
            res.send(result)
        })
        app.put('/updateTask/:id', async (req, res) => {
            const item = req.body
            console.log(item)
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const updateTask = {
                $set: {
                    taskTitle: item.taskTitle,
                    taskDetail: item.taskDetail,
                    submissionInfo: item.submissionInfo
                }
            }
            const result = await tasksCollection.updateOne(query, updateTask)
            res.send(result)
        })
        app.put('/deleteTask/:id', async (req, res) => {
            const id = req.params.id
            const task = req.body
            console.log(task)
            const email = task.email
            const incressCoin = task.totalPayableAmount
            const query = { _id: new ObjectId(id) }
            const result = await tasksCollection.deleteOne(query)
            const update = await userCollection.updateOne(
                { email },
                { $inc: { coin: +incressCoin } }
            )
            res.send({ result, update })
        })
        app.get('/taskList', async (req, res) => {
            const result = await tasksCollection.find({
                $expr: { $gt: [{ $toInt: "$requiredWorks" }, 0] }
            }).toArray()
            res.send(result)
        })
        app.get('/tsskDetails/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await tasksCollection.findOne(query)
            res.send(result)
        })
        app.post('/submitTask', async (req, res) => {
            const task = req.body
            const result = await submitTasksCollection.insertOne(task)
            res.send(result)
        })
        app.get('/submitTask/:email', async (req, res) => {
            const email = req.params.email
            const query = { workerEmail: email }
            const result = await submitTasksCollection.find(query).toArray()
            res.send(result)
        })
        app.get('/admin/allUsers', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })
        app.patch('/makeRole', verifyToken, verifyAdmin, async (req, res) => {
            const role = req.body
            const email = role.email
            const query = { email: email }
            const updateRole = {
                $set: {
                    role: role.value
                }
            }
            const result = await userCollection.updateOne(query, updateRole)
            res.send(result)
        })
        app.delete('/userDelete', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })
        app.get('/allTasks', verifyToken, verifyAdmin, async (req, res) => {
            const result = await tasksCollection.find().toArray()
            res.send(result)
        })
        app.delete('/taskDelete', async (req, res) => {
            const id = req.query.id
            const query = { _id: new ObjectId(id) }
            const result = await tasksCollection.deleteOne(query)
            res.send(result)
        })
        app.get('/bestWorker', async (req, res) => {
            const result = await userCollection.find().sort({ coin: -1 }).limit(6).toArray()
            res.send(result)
        })
        app.get('/admin/totalInfoCount', async (req, res) => {
            const result = await userCollection.aggregate([{
                $group: {
                    _id: null,
                    totalCount: {
                        $sum: '$coin'
                    },
                    totalWorkers: { $sum: { $cond: [{ $eq: ['$role', 'worker'] }, 1, 0] } },
                    totalBuyers: { $sum: { $cond: [{ $eq: ['$role', 'buyer'] }, 1, 0] } }
                }
            }]).toArray()
            const coin = result.length > 0 ? result[0].totalCount : 0;
            const worker = result.length > 0 ? result[0].totalWorkers : 0;
            const buyer = result.length > 0 ? result[0].totalBuyers : 0;
            res.send({ coin, worker, buyer })
        })
        app.get('/buyerTotalTask', async (req, res) => {
            const email = req.query.email
            const query = {
                buyerEmail: email,
                status: 'pending'
            }
            const query2 = {
                buyerEmail: email
            }
            const result3 = await submitTasksCollection.aggregate([
                {$match:{buyerEmail:email,status:'pending'}},
                {$group: {
                    _id: null,
                    totalRequiredWorker: {$sum:{$toDouble: '$requiredWorks' } },
                  }}
            ]).toArray()
            const result4 = await submitTasksCollection.aggregate([
                {$match:{buyerEmail:email,status:'approved'}},
                {$group: {
                    _id: null,
                    totalPaymentPaid: {$sum:{$toDouble: '$payableAmount' } },
                  }}
            ]).toArray()
            const requiredWorks = result3.length > 0 ? result3[0].totalRequiredWorker : 0;
            const payAbleAmount = result4.length>0?  result4[0].totalPaymentPaid:0
            const result = await submitTasksCollection.find(query).toArray()
            const totalTask = await submitTasksCollection.estimatedDocumentCount(query2)
            res.send({result,totalTask,requiredWorks,payAbleAmount})
        })
        app.put('/approveTask/:id', async (req, res) => {
            const id = req.params.id
            const info = req.body
            console.log(info)
            const email = info.workerEmail
            const amount = parseInt(info.payAbleAmount)
            const query = { _id: new ObjectId(id) }
            const incressWorkerCoin = await userCollection.updateOne(
                { email },
                { $inc: { coin: + amount } }
            );
            const updateStatus = {
                $set: {
                    status: 'approved'
                }
            }
            const result = await submitTasksCollection.updateOne(query, updateStatus)
            res.send({ result, incressWorkerCoin })
        })
        app.put('/rejectTask/:id', async (req, res) => {
            const id = req.params.id
            const info = req.body
            const email = info.email
            const amount = ('1')
            console.log(email)
            const query = { _id: new ObjectId(id) }
            const increaseRequiredWorker = await tasksCollection.updateOne(
                { email },
                [
                    {
                        $set: {
                            requiredWorks: {
                                $toString: { $add: [{ $toInt: "$requiredWorks" }, 1] }
                            }
                        }
                    }
                ]
            )
            const updateStatus = {
                $set: {
                    status: 'rejected'
                }
            }
            const result = await submitTasksCollection.updateOne(query, updateStatus)
            res.send({ result, increaseRequiredWorker })
        })
        app.get('/workerApproveTask', async (req, res) => {
            const email = req.query.email
            const query = {
                workerEmail: email,
                status: 'approved'
            }
            const result = await submitTasksCollection.find(query).toArray()
            res.send(result)
        })
        app.get('/workerStates', async (req, res) => {

            const email = req.query.email
            console.log(email)
            
            const result = await submitTasksCollection.aggregate([
                {$match:{workerEmail:email,status:'pending'}},
                {
                $group:{
                    _id:'$email',
                    totalpendingworkers:{$sum:1}
                }
            }]).toArray()
            const result2 = await submitTasksCollection.aggregate([
                { $match: { workerEmail: email, status: "approved" } },
                {
                    $group: {
                        _id: null,
                        totalpayablecoin: { $sum:{$toDouble: "$payableAmount"}  },
                    }
                }]).toArray()
            const result3 = await submitTasksCollection.aggregate([
                {$match:{workerEmail:email}},
                {
                $group:{
                    _id:'$email,',
                    totalworkers:{$sum:1}
                }
            }]).toArray()

            const allpendingWorker=result.length>0?result[0].totalpendingworkers:0
            const totalpayablecoin = result2.length > 0 ? result2[0].totalpayablecoin : 0
            const allWorker=result3.length>0?result3[0].totalworkers:0
            res.send({totalpayablecoin,allpendingWorker,allWorker})
        })
        app.get('/workerCal',async(req,res)=>{
            const email = req.query.email
            // const query = {email:email}
            const result = await userCollection.aggregate([
                {$match:{email:email}},
                {$group: {
                    _id: null,
                    totalCount: {$sum: '$coin'  },
                  }}
            ]).toArray()
            const coin = result.length > 0 ? result[0].totalCount : 0;
            res.send({coin})
        })
        app.post('/withdrawRequest',async(req,res)=>{
            const item = req.body
            console.log(item)
            const result = await withdrawReqCollection.insertOne(item)
            res.send(result)
        })
        app.post('/create-payment-intent',async(req,res)=>{
            const {price} = req.body
            console.log(price)
            const amount = parseInt(price /20)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency:'usd',
                payment_method_types:['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        app.post('/payments',async(req,res)=>{
            const payment = req.body
            const paymentResult = await paymentCollection.insertOne(payment)
            
            res.send({paymentResult})
        })
    } finally {
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('server are work')
})
app.listen(port, () => {
    console.log(`server is running on port ${port}`)
})