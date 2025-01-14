require('dotenv').config()
const express = require('express')
const app = express();
const cors = require('cors')
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const { MongoClient, ServerApiVersion } = require('mongodb');
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
        const verifyAdmin = async (req,res)=>{
            const email = req.decoded.email
            const query = {email: email}
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if(!isAdmin){
                return res.status(403).send({message: 'Forbidden access'})
            }
            next()
        }
        const verifyBuyer = async (req,res)=>{
            const email = req.decoded.email
            const query = {email: email}
            const user = await userCollection.findOne(query)
            const isBuyer = user?.role === 'buyer'
            if(!isBuyer){
                return res.status(403).send({message: 'Forbidden access'})
            }
            next()
        }
        const veryfyWorker = async(req,res)=>{
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