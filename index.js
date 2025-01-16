require('dotenv').config()
const express = require('express')
const app = express();
const cors = require('cors')
const jwt = require('jsonwebtoken')
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
        
        const verifyToken = (req,res,next)=>{
            if(!req.headers.authorization){
                return res.status(401).send({message: ' Unauthorized access'})
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{
                if(err){
                    return res.status(401).send({message: ' Unauthorized access'})
                }
                req.decoded = decoded;
                next()
            })
        }
        const verifyAdmin = async (req,res,next)=>{
            const email = req.decoded.email
            const query = {email: email}
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if(!isAdmin){
                return res.status(403).send({message: 'Forbidden access'})
            }
            next();
        }
        const verifyBuyer = async (req,res,next)=>{
            const email = req.decoded.email
            const query = {email: email}
            const user = await userCollection.findOne(query)
            const isBuyer = user?.role === 'buyer'
            if(!isBuyer){
                return res.status(403).send({message: 'Forbidden access'})
            }
            next()
        }
        const veryfyWorker = async(req,res,next)=>{
            const email = req.decoded.email
            const query = {email: email}
            const user = await userCollection.findOne(query)
            const isWorker = user?.role === 'worker'
            if(!isWorker){
                return res.status(403).send({message: 'Forbidden access'})
            }
            next()
        }
        app.post('/jwt',async(req,res)=>{
            const user =req.body
            const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn:'24h'})
            res.send({token})
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
        app.get('/user/admin/:email',verifyToken,async(req,res)=>{
            const email = req.params.email
            
            if(email !== req.decoded.email){
                return res.status(403).send({message: 'Forbidden access'})
            }
            const query = {email: email}
            const user = await userCollection.findOne(query)
            let admin = false
            if(user){
                admin = user?.role === 'admin'
            }
            res.send({admin})
            
        })
        app.get('/user/buyer/:email',verifyToken,async(req,res)=>{
            const email = req.params.email
            if(email !== req.decoded.email){
                return res.status(403).send({message: 'Forbidden access'})
            }
            const query = {email: email}
            const user = await userCollection.findOne(query)
            let buyer = false
            if(user){
                buyer = user?.role === 'buyer'
            }
            res.send({buyer})
            
        })
        app.get('/user/worker/:email',verifyToken,async(req,res)=>{
            const email = req.params.email
            if(email !== req.decoded.email){
                return res.status(403).send({message: 'Forbidden access'})
            }
            const query = {email: email}
            const user = await userCollection.findOne(query)
            let worker = false
            if(user){
                worker = user?.role === 'worker'
            }
            res.send({worker})
           
        })
        app.get('/coin/:email',async (req,res)=>{
            const email = req.params.email
            const result = await userCollection.aggregate([{
                $match:{email:email}
            },{
                $group:{
                   _id:'$email',
                    totalcoin: {
                        $sum:'$coin'
                    }
                }
            }]).toArray()
            const coins = result.length>0?result[0].totalcoin:0;
            res.send({coins})
        })
        app.post('/taskItems',async(req,res)=>{
            const taskItem = req.body
            const email= taskItem.email
             const totalCoin = taskItem.requiredWorks*taskItem.payableAmount
             const updatedUser = await userCollection.updateOne(
                { email },
                { $inc: { coin: -totalCoin } }
              ); 
            const result = await tasksCollection.insertOne(taskItem)
            res.send({result,updatedUser})
        })
        app.get('/mytasks/:email',async(req,res)=>{
            const email = req.params.email
            const query = {email: email}
            const result = await tasksCollection.find(query).toArray()
            res.send(result)
        })
        app.get('/updateTask/:id',async(req,res)=>{
            const id = req.params.id
            const query = {_id: new ObjectId(id)}
            const result = await tasksCollection.findOne(query)
            res.send(result)
        })
        app.put('/updateTask/:id',async(req,res)=>{
            const item= req.body
            console.log(item)
            const id = req.params.id
            const query = {_id: new ObjectId(id)}
            const updateTask ={
            $set:{
                taskTitle: item.taskTitle,
                taskDetail: item.taskDetail,
                submissionInfo: item.submissionInfo
            }
            }
            const result = await tasksCollection.updateOne(query,updateTask)
            res.send(result)
        })
        app.put('/deleteTask/:id',async(req,res)=>{
            const id = req.params.id
            const task = req.body
            console.log(task)
            const email = task.email
            const incressCoin=task.totalPayableAmount
            const query = {_id : new ObjectId(id)}
            const result = await tasksCollection.deleteOne(query)
            const update= await userCollection.updateOne(
                {email},
                {$inc:{coin: +incressCoin}}
            )
            res.send({result,update})
        })
        app.get('/taskList',async(req,res)=>{
            const result = await tasksCollection.find({
                $expr: { $gt: [{ $toInt: "$requiredWorks" }, 0] }
              }).toArray()
            res.send(result)
        })
        app.get('/tsskDetails/:id',async(req,res)=>{
            const id = req.params.id
            const query = {_id: new ObjectId(id)}
            const result = await tasksCollection.findOne(query)
            res.send(result)
        })
        app.post('/submitTask',async(req,res)=>{
            const task = req.body
            const result = await submitTasksCollection.insertOne(task)
            res.send(result)
        })
        app.get('/submitTask/:email',async(req,res)=>{
            const email = req.params.email
            const query = {workerEmail : email} 
            const result = await submitTasksCollection.find(query).toArray()
            res.send(result)
        })
        app.get('/admin/allUsers',verifyToken,verifyAdmin,async(req,res)=>{
            const result = await userCollection.find().toArray()
            res.send(result)
        })
        app.patch('/makeRole',verifyToken,verifyAdmin,async(req,res)=>{
            const role = req.body
            const email = role.email
            const query = {email:email} 
            const updateRole = {
                $set:{
                    role:role.value
                }
            }
            const result = await userCollection.updateOne(query,updateRole)
            res.send(result)
        })
        app.delete('/userDelete',verifyToken,verifyAdmin,async(req,res)=>{
            const email = req.query.email
            const query ={email: email}
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })
        app.get('/allTasks',verifyToken,verifyAdmin,async(req,res)=>{
            const result = await tasksCollection.find().toArray()
            res.send(result)
        })
        app.delete('/taskDelete',async(req,res)=>{
            const id = req.query.id
            const query = {_id: new ObjectId(id)}
            const result = await tasksCollection.deleteOne(query)
            res.send(result)
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